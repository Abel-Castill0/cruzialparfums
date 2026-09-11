-- Cruzial Platform V2 — Import Admin Operations (Phase 4J5C1)
--
-- Adds server-side mutation RPCs for:
--   - Order status lifecycle (pending → confirmed → fulfilled, cancel)
--   - Customer CRUD with phone normalization + duplicate detection
--   - Customer verification status management
--   - Customer archival
--   - Order ↔ customer linking
--   - Create customer from order snapshot
--
-- All RPCs are SECURITY DEFINER, resolve the Import business unit
-- server-side, validate membership/role, append audit, and use typed
-- error codes for application-level error mapping.
--
-- Read paths use plain PostgREST with existing RLS policies — no RPC
-- needed for SELECTs.

-- ---------------------------------------------------------------------------
-- Error code registry (application-level, P2xxx reserved for Import admin)
-- ---------------------------------------------------------------------------
-- P2020 stale_state          — order was modified since expected
-- P2021 forbidden            — caller lacks admin role for Import
-- P2022 not_found            — row does not exist or belongs to another unit
-- P2023 invalid_transition   — status change not allowed
-- P2024 archived_order       — archived order cannot change status
-- P2025 invalid_reason       — cancellation reason missing or too long
-- P2026 duplicate_phone      — active customer with same normalized phone exists
-- P2027 customer_archived    — customer is archived, cannot be edited
-- P2028 link_mismatch        — normalized phone mismatch between order and customer
-- P2029 order_has_customer    — order already linked to a customer
-- P2030 customer_has_link     — customer already linked to an order via this order
-- P2031 ambiguous_customers  — multiple active customers match normalized phone
-- P2032 invalid_status       — customer verified status value not allowed

-- ---------------------------------------------------------------------------
-- 1. Order status lifecycle
-- ---------------------------------------------------------------------------

create or replace function public.admin_import_update_order_status(
  p_order_id uuid,
  p_expected_status text,
  p_new_status text,
  p_reason text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_unit_id uuid;
  v_before public.orders;
  v_after public.orders;
begin
  -- Resolve Import business unit (never a parameter)
  select id into v_import_unit_id from public.business_units where code = 'import';
  if v_import_unit_id is null then
    raise exception 'import business unit is not provisioned' using errcode = 'P0002';
  end if;

  -- Load order with row-level lock
  select * into v_before from public.orders
  where id = p_order_id
    and business_unit_id = v_import_unit_id
  for update;

  if v_before.id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  -- Membership + admin role check
  perform app.assert_admin_for(v_import_unit_id);

  -- Archived orders are immutable
  if v_before.archived_at is not null then
    raise exception 'archived order cannot change status' using errcode = 'P2024';
  end if;

  -- Concurrency check: expected status must match current
  if v_before.status <> p_expected_status then
    raise exception 'order status changed since expected (expected %, got %)',
      p_expected_status, v_before.status using errcode = 'P2020';
  end if;

  -- Validate status values
  if p_expected_status not in (
    'pending_whatsapp_confirmation', 'confirmed', 'fulfilled', 'cancelled'
  ) then
    raise exception 'invalid expected status %', p_expected_status using errcode = '22023';
  end if;

  if p_new_status not in (
    'pending_whatsapp_confirmation', 'confirmed', 'fulfilled', 'cancelled'
  ) then
    raise exception 'invalid new status %', p_new_status using errcode = '22023';
  end if;

  -- Validate transition
  -- pending_whatsapp_confirmation → confirmed, cancelled
  -- confirmed → fulfilled, cancelled
  -- fulfilled → (terminal)
  -- cancelled → (terminal)
  if v_before.status = 'pending_whatsapp_confirmation'
     and p_new_status not in ('confirmed', 'cancelled') then
    raise exception 'invalid transition from % to %', v_before.status, p_new_status
      using errcode = 'P2023';
  end if;

  if v_before.status = 'confirmed'
     and p_new_status not in ('fulfilled', 'cancelled') then
    raise exception 'invalid transition from % to %', v_before.status, p_new_status
      using errcode = 'P2023';
  end if;

  if v_before.status in ('fulfilled', 'cancelled') then
    raise exception 'terminal order cannot change status' using errcode = 'P2023';
  end if;

  -- Cancellation requires a reason
  if p_new_status = 'cancelled' then
    if p_reason is null or length(trim(p_reason)) < 3 then
      raise exception 'cancellation reason is required (min 3 chars)' using errcode = 'P2025';
    end if;
    if length(p_reason) > 300 then
      raise exception 'cancellation reason too long (max 300 chars)' using errcode = 'P2025';
    end if;
  end if;

  -- Perform status update
  update public.orders set
    status = p_new_status,
    updated_at = now()
  where id = p_order_id
    and status = p_expected_status
  returning * into v_after;

  if v_after.id is null then
    raise exception 'order was modified by another session' using errcode = 'P2020';
  end if;

  -- Append audit entry
  perform app.write_audit_log(
    v_import_unit_id,
    'order_state_change',
    'order',
    p_order_id,
    jsonb_build_object(
      'status', v_before.status,
      'order_number', v_before.order_number,
      'reason', p_reason
    ),
    jsonb_build_object(
      'status', v_after.status,
      'order_number', v_after.order_number,
      'reason', p_reason
    )
  );

  return v_after;
end;
$$;

revoke all on function public.admin_import_update_order_status(uuid, text, text, text) from public, anon;
grant execute on function public.admin_import_update_order_status(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Phone normalization helper (Import-specific)
-- ---------------------------------------------------------------------------

create or replace function app.normalize_import_phone(p_phone text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_phone is null then null
    else nullif(regexp_replace(p_phone, '[^0-9]', '', 'g'), '')
  end
$$;

revoke all on function app.normalize_import_phone(text) from public, anon;
grant execute on function app.normalize_import_phone(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Customer creation
-- ---------------------------------------------------------------------------

create or replace function public.admin_import_create_customer(
  p_full_name text,
  p_phone text default null,
  p_notes text default null
)
returns public.customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_unit_id uuid;
  v_normalized_phone text;
  v_existing_count bigint;
  v_result public.customers;
begin
  select id into v_import_unit_id from public.business_units where code = 'import';
  if v_import_unit_id is null then
    raise exception 'import business unit is not provisioned' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_import_unit_id);

  if p_full_name is null or length(trim(p_full_name)) = 0 then
    raise exception 'full_name is required' using errcode = '22023';
  end if;

  v_normalized_phone := app.normalize_import_phone(p_phone);

  -- Duplicate detection: if phone provided, check for existing active customers
  if v_normalized_phone is not null then
    select count(*) into v_existing_count
    from public.customers
    where business_unit_id = v_import_unit_id
      and app.normalize_import_phone(phone) = v_normalized_phone
      and archived_at is null;

    if v_existing_count > 0 then
      raise exception 'active customer with this phone already exists' using errcode = 'P2026';
    end if;
  end if;

  insert into public.customers (
    business_unit_id,
    full_name,
    phone,
    verified_customer_status,
    notes
  ) values (
    v_import_unit_id,
    trim(p_full_name),
    p_phone,
    'new',
    p_notes
  ) returning * into v_result;

  perform app.write_audit_log(
    v_import_unit_id,
    'create',
    'customer',
    v_result.id,
    null,
    jsonb_build_object(
      'full_name', v_result.full_name,
      'phone', v_result.phone,
      'verified_customer_status', v_result.verified_customer_status
    )
  );

  return v_result;
end;
$$;

revoke all on function public.admin_import_create_customer(text, text, text) from public, anon;
grant execute on function public.admin_import_create_customer(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Customer update (full_name, phone, notes)
-- ---------------------------------------------------------------------------

create or replace function public.admin_import_update_customer(
  p_customer_id uuid,
  p_full_name text,
  p_phone text default null,
  p_notes text default null
)
returns public.customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_unit_id uuid;
  v_before public.customers;
  v_normalized_phone text;
  v_existing_count bigint;
  v_after public.customers;
begin
  select id into v_import_unit_id from public.business_units where code = 'import';
  if v_import_unit_id is null then
    raise exception 'import business unit is not provisioned' using errcode = 'P0002';
  end if;

  select * into v_before from public.customers
  where id = p_customer_id
    and business_unit_id = v_import_unit_id;

  if v_before.id is null then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_import_unit_id);

  if v_before.archived_at is not null then
    raise exception 'archived customer cannot be edited' using errcode = 'P2027';
  end if;

  if p_full_name is null or length(trim(p_full_name)) = 0 then
    raise exception 'full_name is required' using errcode = '22023';
  end if;

  v_normalized_phone := app.normalize_import_phone(p_phone);

  -- Duplicate detection on new phone
  if v_normalized_phone is not null then
    select count(*) into v_existing_count
    from public.customers
    where business_unit_id = v_import_unit_id
      and id <> p_customer_id
      and app.normalize_import_phone(phone) = v_normalized_phone
      and archived_at is null;

    if v_existing_count > 0 then
      raise exception 'active customer with this phone already exists' using errcode = 'P2026';
    end if;
  end if;

  update public.customers set
    full_name = trim(p_full_name),
    phone = p_phone,
    notes = p_notes,
    updated_at = now()
  where id = p_customer_id
    and business_unit_id = v_import_unit_id
  returning * into v_after;

  perform app.write_audit_log(
    v_import_unit_id,
    'update',
    'customer',
    p_customer_id,
    jsonb_build_object(
      'full_name', v_before.full_name,
      'phone', v_before.phone,
      'notes', v_before.notes
    ),
    jsonb_build_object(
      'full_name', v_after.full_name,
      'phone', v_after.phone,
      'notes', v_after.notes
    )
  );

  return v_after;
end;
$$;

revoke all on function public.admin_import_update_customer(uuid, text, text, text) from public, anon;
grant execute on function public.admin_import_update_customer(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Customer verification status
-- ---------------------------------------------------------------------------

create or replace function public.admin_import_verify_customer_status(
  p_customer_id uuid,
  p_new_status text
)
returns public.customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_unit_id uuid;
  v_before public.customers;
  v_after public.customers;
begin
  select id into v_import_unit_id from public.business_units where code = 'import';
  if v_import_unit_id is null then
    raise exception 'import business unit is not provisioned' using errcode = 'P0002';
  end if;

  select * into v_before from public.customers
  where id = p_customer_id
    and business_unit_id = v_import_unit_id;

  if v_before.id is null then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_import_unit_id);

  if v_before.archived_at is not null then
    raise exception 'archived customer cannot change status' using errcode = 'P2027';
  end if;

  if p_new_status not in ('pending_verification', 'new', 'returning') then
    raise exception 'invalid customer status %', p_new_status using errcode = 'P2032';
  end if;

  update public.customers set
    verified_customer_status = p_new_status,
    verified_by = case
      when p_new_status in ('new', 'returning') then auth.uid()
      else null
    end,
    verified_at = case
      when p_new_status in ('new', 'returning') then now()
      else null
    end,
    updated_at = now()
  where id = p_customer_id
    and business_unit_id = v_import_unit_id
  returning * into v_after;

  perform app.write_audit_log(
    v_import_unit_id,
    'customer_verification_change',
    'customer',
    p_customer_id,
    jsonb_build_object(
      'verified_customer_status', v_before.verified_customer_status,
      'verified_by', v_before.verified_by,
      'verified_at', v_before.verified_at
    ),
    jsonb_build_object(
      'verified_customer_status', v_after.verified_customer_status,
      'verified_by', v_after.verified_by,
      'verified_at', v_after.verified_at
    )
  );

  return v_after;
end;
$$;

revoke all on function public.admin_import_verify_customer_status(uuid, text) from public, anon;
grant execute on function public.admin_import_verify_customer_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Customer archival
-- ---------------------------------------------------------------------------

create or replace function public.admin_import_archive_customer(
  p_customer_id uuid
)
returns public.customers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_unit_id uuid;
  v_before public.customers;
  v_after public.customers;
begin
  select id into v_import_unit_id from public.business_units where code = 'import';
  if v_import_unit_id is null then
    raise exception 'import business unit is not provisioned' using errcode = 'P0002';
  end if;

  select * into v_before from public.customers
  where id = p_customer_id
    and business_unit_id = v_import_unit_id;

  if v_before.id is null then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_import_unit_id);

  if v_before.archived_at is not null then
    raise exception 'customer is already archived' using errcode = 'P2027';
  end if;

  update public.customers set
    archived_at = now(),
    updated_at = now()
  where id = p_customer_id
    and business_unit_id = v_import_unit_id
  returning * into v_after;

  perform app.write_audit_log(
    v_import_unit_id,
    'archive',
    'customer',
    p_customer_id,
    jsonb_build_object(
      'full_name', v_before.full_name,
      'phone', v_before.phone,
      'verified_customer_status', v_before.verified_customer_status
    ),
    jsonb_build_object(
      'archived_at', v_after.archived_at
    )
  );

  return v_after;
end;
$$;

revoke all on function public.admin_import_archive_customer(uuid) from public, anon;
grant execute on function public.admin_import_archive_customer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Link customer to order
-- ---------------------------------------------------------------------------

create or replace function public.admin_import_link_customer_order(
  p_order_id uuid,
  p_customer_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_unit_id uuid;
  v_order public.orders;
  v_customer public.customers;
  v_order_phone text;
  v_customer_phone text;
  v_after public.orders;
begin
  select id into v_import_unit_id from public.business_units where code = 'import';
  if v_import_unit_id is null then
    raise exception 'import business unit is not provisioned' using errcode = 'P0002';
  end if;

  select * into v_order from public.orders
  where id = p_order_id
    and business_unit_id = v_import_unit_id;

  if v_order.id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  select * into v_customer from public.customers
  where id = p_customer_id
    and business_unit_id = v_import_unit_id;

  if v_customer.id is null then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_import_unit_id);

  -- Order must not already have a customer linked
  if v_order.customer_id is not null then
    raise exception 'order already has a customer linked' using errcode = 'P2029';
  end if;

  -- Customer must not be archived
  if v_customer.archived_at is not null then
    raise exception 'archived customer cannot be linked' using errcode = 'P2027';
  end if;

  -- Normalized phones must match
  v_order_phone := app.normalize_import_phone(v_order.customer_snapshot ->> 'phone');
  v_customer_phone := app.normalize_import_phone(v_customer.phone);

  if v_order_phone is null or v_customer_phone is null or v_order_phone <> v_customer_phone then
    raise exception 'phone mismatch between order and customer' using errcode = 'P2028';
  end if;

  update public.orders set
    customer_id = p_customer_id,
    updated_at = now()
  where id = p_order_id
    and business_unit_id = v_import_unit_id
  returning * into v_after;

  perform app.write_audit_log(
    v_import_unit_id,
    'update',
    'order',
    p_order_id,
    jsonb_build_object('customer_id', v_order.customer_id),
    jsonb_build_object('customer_id', v_after.customer_id)
  );

  return v_after;
end;
$$;

revoke all on function public.admin_import_link_customer_order(uuid, uuid) from public, anon;
grant execute on function public.admin_import_link_customer_order(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Create customer from order + link (atomic)
-- ---------------------------------------------------------------------------

create or replace function public.admin_import_create_customer_from_order(
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_unit_id uuid;
  v_order public.orders;
  v_normalized_phone text;
  v_existing_count bigint;
  v_existing_customer_id uuid;
  v_new_customer public.customers;
  v_result jsonb;
begin
  select id into v_import_unit_id from public.business_units where code = 'import';
  if v_import_unit_id is null then
    raise exception 'import business unit is not provisioned' using errcode = 'P0002';
  end if;

  select * into v_order from public.orders
  where id = p_order_id
    and business_unit_id = v_import_unit_id;

  if v_order.id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  perform app.assert_admin_for(v_import_unit_id);

  -- Order must not already have a customer linked
  if v_order.customer_id is not null then
    raise exception 'order already has a customer linked' using errcode = 'P2029';
  end if;

  v_normalized_phone := app.normalize_import_phone(v_order.customer_snapshot ->> 'phone');

  if v_normalized_phone is null then
    raise exception 'order has no usable phone to create a customer' using errcode = '22023';
  end if;

  -- Check for existing active customers with same normalized phone
  select count(*), min(id) into v_existing_count, v_existing_customer_id
  from public.customers
  where business_unit_id = v_import_unit_id
    and app.normalize_import_phone(phone) = v_normalized_phone
    and archived_at is null;

  -- If exactly one match, link it
  if v_existing_count = 1 then
    update public.orders set
      customer_id = v_existing_customer_id,
      updated_at = now()
    where id = p_order_id
      and business_unit_id = v_import_unit_id;

    perform app.write_audit_log(
      v_import_unit_id,
      'update',
      'order',
      p_order_id,
      jsonb_build_object('customer_id', null),
      jsonb_build_object('customer_id', v_existing_customer_id)
    );

    return jsonb_build_object(
      'action', 'linked',
      'customer_id', v_existing_customer_id
    );
  end if;

  -- If multiple matches, fail (ambiguous)
  if v_existing_count > 1 then
    raise exception 'multiple active customers with this phone — resolve in Clientes'
      using errcode = 'P2031';
  end if;

  -- Zero matches: create new customer from order snapshot
  insert into public.customers (
    business_unit_id,
    full_name,
    phone,
    verified_customer_status,
    verified_by,
    verified_at
  ) values (
    v_import_unit_id,
    coalesce(trim(v_order.customer_snapshot ->> 'name'), 'Sin nombre'),
    v_order.customer_snapshot ->> 'phone',
    'new',
    auth.uid(),
    now()
  ) returning * into v_new_customer;

  -- Link order to new customer
  update public.orders set
    customer_id = v_new_customer.id,
    updated_at = now()
  where id = p_order_id
    and business_unit_id = v_import_unit_id;

  perform app.write_audit_log(
    v_import_unit_id,
    'create',
    'customer',
    v_new_customer.id,
    null,
    jsonb_build_object(
      'full_name', v_new_customer.full_name,
      'phone', v_new_customer.phone,
      'verified_customer_status', v_new_customer.verified_customer_status
    )
  );

  perform app.write_audit_log(
    v_import_unit_id,
    'update',
    'order',
    p_order_id,
    jsonb_build_object('customer_id', null),
    jsonb_build_object('customer_id', v_new_customer.id)
  );

  return jsonb_build_object(
    'action', 'created',
    'customer_id', v_new_customer.id
  );
end;
$$;

revoke all on function public.admin_import_create_customer_from_order(uuid) from public, anon;
grant execute on function public.admin_import_create_customer_from_order(uuid) to authenticated;
