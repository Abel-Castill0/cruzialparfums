-- Cruzial Platform V2 — Import Admin Operations Final Correction (Phase 4J5C1)
--
-- Fixes three production-integrity gaps found by remote review:
--
-- 1. Canonical phone storage: create/update RPCs now persist the normalized
--    digits-only phone (not the raw formatted input). 9–15 digit validation
--    added. create_customer_from_order stores normalized order phone.
--
-- 2. Verified provenance: admin-created customers now persist verified_by
--    and verified_at at creation time for 'new' status, establishing
--    actor/time authority provenance.
--
-- 3. Authorize-before-lookup: all 6 mutation RPCs now call
--    app.assert_admin_for() BEFORE reading/locking the target row,
--    preventing existence-oracle leakage to unauthorized callers.
--
-- 4. Phone helper grant: app.normalize_import_phone is an internal helper
--    only callable by SECURITY DEFINER owners. Revoke from authenticated.

-- ---------------------------------------------------------------------------
-- 0. CHECK constraint: expand to allow full lifecycle statuses
-- ---------------------------------------------------------------------------
-- Original constraint only allowed draft/pending_whatsapp_confirmation.
-- The RPC transitions need confirmed/fulfilled/cancelled.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (
  status = ANY (ARRAY[
    'draft'::text,
    'pending_whatsapp_confirmation'::text,
    'confirmed'::text,
    'fulfilled'::text,
    'cancelled'::text
  ])
);

-- ---------------------------------------------------------------------------
-- 0b. freeze_order_snapshot: allow admin status changes via session variable
-- ---------------------------------------------------------------------------
-- The trigger blocks all commercial field changes when status is not draft.
-- Status transitions via RPC need a bypass; customer_id linking also needs one.
-- The session variable 'app.allow_order_status_change' gates the bypass.

create or replace function app.freeze_order_snapshot()
returns trigger
language plpgsql
as $$
begin
  -- Allow admin RPCs to change status and customer_id when signaled
  if current_setting('app.allow_order_status_change', true) = '1' then
    -- Only status and customer_id may change; all other commercial fields remain frozen
    if old.status <> 'draft' and (
         new.business_unit_id is distinct from old.business_unit_id
         or new.order_number is distinct from old.order_number
         or new.campaign_id is distinct from old.campaign_id
         or new.shipping_method_id is distinct from old.shipping_method_id
         or new.channel is distinct from old.channel
         or new.customer_snapshot is distinct from old.customer_snapshot
         or new.delivery_snapshot is distinct from old.delivery_snapshot
         or new.claimed_customer_status is distinct from old.claimed_customer_status
         or new.verified_customer_status_snapshot is distinct from old.verified_customer_status_snapshot
         or new.deposit_policy_snapshot is distinct from old.deposit_policy_snapshot
         or new.deposit_percentage_snapshot is distinct from old.deposit_percentage_snapshot
         or new.subtotal_amount is distinct from old.subtotal_amount
         or new.currency is distinct from old.currency
       ) then
      raise exception 'order commercial snapshot is immutable after draft (order %)', old.id
        using errcode = 'restrict_violation';
    end if;
    return new;
  end if;

  -- Default: block any change when not in draft
  if old.status <> 'draft' and (
       new.status is distinct from old.status
       or new.business_unit_id is distinct from old.business_unit_id
       or new.order_number is distinct from old.order_number
       or new.campaign_id is distinct from old.campaign_id
       or new.customer_id is distinct from old.customer_id
       or new.shipping_method_id is distinct from old.shipping_method_id
       or new.channel is distinct from old.channel
       or new.customer_snapshot is distinct from old.customer_snapshot
       or new.delivery_snapshot is distinct from old.delivery_snapshot
       or new.claimed_customer_status is distinct from old.claimed_customer_status
       or new.verified_customer_status_snapshot is distinct from old.verified_customer_status_snapshot
       or new.deposit_policy_snapshot is distinct from old.deposit_policy_snapshot
       or new.deposit_percentage_snapshot is distinct from old.deposit_percentage_snapshot
       or new.subtotal_amount is distinct from old.subtotal_amount
       or new.currency is distinct from old.currency
     ) then
    raise exception 'order commercial snapshot is immutable after draft (order %)', old.id
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

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

  -- Authorize BEFORE reading target row (prevents existence oracle)
  perform app.assert_admin_for(v_import_unit_id);

  -- Load order with row-level lock
  select * into v_before from public.orders
  where id = p_order_id
    and business_unit_id = v_import_unit_id
  for update;

  if v_before.id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

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

  -- Perform status update (signal freeze_order_snapshot to allow status change)
  perform set_config('app.allow_order_status_change', '1', true);
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

-- ---------------------------------------------------------------------------
-- 2. Customer creation — canonical phone + verified provenance + auth-first
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

  -- Authorize BEFORE any data access
  perform app.assert_admin_for(v_import_unit_id);

  if p_full_name is null or length(trim(p_full_name)) = 0 then
    raise exception 'full_name is required' using errcode = '22023';
  end if;

  -- Normalize and validate phone
  v_normalized_phone := app.normalize_import_phone(p_phone);

  if v_normalized_phone is not null then
    if length(v_normalized_phone) < 9 or length(v_normalized_phone) > 15 then
      raise exception 'phone must be 9-15 digits (got %)', length(v_normalized_phone)
        using errcode = '22023';
    end if;

    -- Duplicate detection: check for existing active customers
    select count(*) into v_existing_count
    from public.customers
    where business_unit_id = v_import_unit_id
      and app.normalize_import_phone(phone) = v_normalized_phone
      and archived_at is null;

    if v_existing_count > 0 then
      raise exception 'active customer with this phone already exists' using errcode = 'P2026';
    end if;
  end if;

  -- Persist canonical normalized phone (not raw input)
  insert into public.customers (
    business_unit_id,
    full_name,
    phone,
    verified_customer_status,
    verified_by,
    verified_at,
    notes
  ) values (
    v_import_unit_id,
    trim(p_full_name),
    v_normalized_phone,
    'new',
    auth.uid(),
    now(),
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
      'verified_customer_status', v_result.verified_customer_status,
      'verified_by', v_result.verified_by
    )
  );

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Customer update — canonical phone + auth-first
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

  -- Authorize BEFORE reading target row (prevents existence oracle)
  perform app.assert_admin_for(v_import_unit_id);

  select * into v_before from public.customers
  where id = p_customer_id
    and business_unit_id = v_import_unit_id;

  if v_before.id is null then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

  if v_before.archived_at is not null then
    raise exception 'archived customer cannot be edited' using errcode = 'P2027';
  end if;

  if p_full_name is null or length(trim(p_full_name)) = 0 then
    raise exception 'full_name is required' using errcode = '22023';
  end if;

  -- Normalize and validate phone
  v_normalized_phone := app.normalize_import_phone(p_phone);

  if v_normalized_phone is not null then
    if length(v_normalized_phone) < 9 or length(v_normalized_phone) > 15 then
      raise exception 'phone must be 9-15 digits (got %)', length(v_normalized_phone)
        using errcode = '22023';
    end if;

    -- Duplicate detection on new phone
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

  -- Persist canonical normalized phone (not raw input)
  update public.customers set
    full_name = trim(p_full_name),
    phone = v_normalized_phone,
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

-- ---------------------------------------------------------------------------
-- 4. Customer verification status — auth-first
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

  -- Authorize BEFORE reading target row (prevents existence oracle)
  perform app.assert_admin_for(v_import_unit_id);

  select * into v_before from public.customers
  where id = p_customer_id
    and business_unit_id = v_import_unit_id;

  if v_before.id is null then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

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

-- ---------------------------------------------------------------------------
-- 5. Customer archival — auth-first
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

  -- Authorize BEFORE reading target row (prevents existence oracle)
  perform app.assert_admin_for(v_import_unit_id);

  select * into v_before from public.customers
  where id = p_customer_id
    and business_unit_id = v_import_unit_id;

  if v_before.id is null then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

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

-- ---------------------------------------------------------------------------
-- 6. Link customer to order — auth-first
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

  -- Authorize BEFORE reading target rows (prevents existence oracle)
  perform app.assert_admin_for(v_import_unit_id);

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

  perform set_config('app.allow_order_status_change', '1', true);
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

-- ---------------------------------------------------------------------------
-- 7. Create customer from order — canonical phone + auth-first
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

  -- Authorize BEFORE reading target row (prevents existence oracle)
  perform app.assert_admin_for(v_import_unit_id);

  select * into v_order from public.orders
  where id = p_order_id
    and business_unit_id = v_import_unit_id;

  if v_order.id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  -- Order must not already have a customer linked
  if v_order.customer_id is not null then
    raise exception 'order already has a customer linked' using errcode = 'P2029';
  end if;

  -- Normalize order phone (canonical digits-only)
  v_normalized_phone := app.normalize_import_phone(v_order.customer_snapshot ->> 'phone');

  if v_normalized_phone is null then
    raise exception 'order has no usable phone to create a customer' using errcode = '22023';
  end if;

  -- Check for existing active customers with same normalized phone
  select count(*), min(id::text)::uuid into v_existing_count, v_existing_customer_id
  from public.customers
  where business_unit_id = v_import_unit_id
    and app.normalize_import_phone(phone) = v_normalized_phone
    and archived_at is null;

  -- If exactly one match, link it
  if v_existing_count = 1 then
    perform set_config('app.allow_order_status_change', '1', true);
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

  -- Zero matches: create new customer from order snapshot with canonical phone
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
    v_normalized_phone,
    'new',
    auth.uid(),
    now()
  ) returning * into v_new_customer;

  -- Link order to new customer (signal freeze_order_snapshot to allow customer_id change)
  perform set_config('app.allow_order_status_change', '1', true);
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
      'verified_customer_status', v_new_customer.verified_customer_status,
      'verified_by', v_new_customer.verified_by
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

-- ---------------------------------------------------------------------------
-- 8. Phone helper — revoke from authenticated (least privilege)
-- ---------------------------------------------------------------------------

revoke all on function app.normalize_import_phone(text) from public, anon, authenticated;
