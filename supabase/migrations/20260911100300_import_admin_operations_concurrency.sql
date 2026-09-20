-- Cruzial Platform V2 — Import Admin Operations Concurrency Gate (Phase 4J5C1)
--
-- Final production-integrity hardening for customer/order linking:
--
-- 1. Canonical phone uniqueness: partial unique index on active Import customers
--    prevents two active customers sharing the same normalized phone.
-- 2. Customer creation: unique_violation caught and re-thrown as P2026.
-- 3. Customer update: FOR UPDATE row lock + unique_violation → P2026.
-- 4. Customer verify/archive: FOR UPDATE row lock after auth.
-- 5. Link customer to order: FOR UPDATE on order + conditional customer_id IS NULL.
-- 6. Create customer from order: FOR UPDATE on order before any checks.
-- 7. Archived phone reuse: partial index excludes archived_at, so archived
--    customers free the phone slot.

-- ---------------------------------------------------------------------------
-- 1. Canonical phone uniqueness — partial unique index
-- ---------------------------------------------------------------------------
-- Active (non-archived) Import customers cannot share a canonical phone.
-- NULL phones are excluded (not all customers have phones).
-- Scoped to Import business unit only — same phone in Parfums is allowed.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS customers_import_active_phone_uniq
  ON public.customers (business_unit_id, (app.normalize_import_phone(phone)))
  WHERE business_unit_id = '22222222-2222-4222-8222-222222222222'
    AND archived_at IS NULL
    AND phone IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Customer creation — unique_violation → P2026
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_import_create_customer(
  p_full_name text,
  p_phone text default null,
  p_notes text default null
)
RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
set search_path = ''
AS $$
DECLARE
  v_import_unit_id uuid;
  v_normalized_phone text;
  v_result public.customers;
BEGIN
  SELECT id INTO v_import_unit_id FROM public.business_units WHERE code = 'import';
  IF v_import_unit_id IS NULL THEN
    RAISE EXCEPTION 'import business unit is not provisioned' USING errcode = 'P0002';
  END IF;

  PERFORM app.assert_admin_for(v_import_unit_id);

  IF p_full_name IS NULL OR length(trim(p_full_name)) = 0 THEN
    RAISE EXCEPTION 'full_name is required' USING errcode = '22023';
  END IF;

  v_normalized_phone := app.normalize_import_phone(p_phone);

  IF v_normalized_phone IS NOT NULL THEN
    IF length(v_normalized_phone) < 9 OR length(v_normalized_phone) > 15 THEN
      RAISE EXCEPTION 'phone must be 9-15 digits (got %)', length(v_normalized_phone)
        USING errcode = '22023';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.customers (
      business_unit_id, full_name, phone,
      verified_customer_status, verified_by, verified_at, notes
    ) VALUES (
      v_import_unit_id, trim(p_full_name), v_normalized_phone,
      'new', auth.uid(), now(), p_notes
    ) RETURNING * INTO v_result;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'active customer with this phone already exists'
      USING errcode = 'P2026';
  END;

  PERFORM app.write_audit_log(
    v_import_unit_id, 'create', 'customer', v_result.id, null,
    jsonb_build_object(
      'full_name', v_result.full_name, 'phone', v_result.phone,
      'verified_customer_status', v_result.verified_customer_status,
      'verified_by', v_result.verified_by
    )
  );

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Customer update — FOR UPDATE + unique_violation → P2026
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_import_update_customer(
  p_customer_id uuid,
  p_full_name text,
  p_phone text default null,
  p_notes text default null
)
RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
set search_path = ''
AS $$
DECLARE
  v_import_unit_id uuid;
  v_before public.customers;
  v_normalized_phone text;
  v_after public.customers;
BEGIN
  SELECT id INTO v_import_unit_id FROM public.business_units WHERE code = 'import';
  IF v_import_unit_id IS NULL THEN
    RAISE EXCEPTION 'import business unit is not provisioned' USING errcode = 'P0002';
  END IF;

  PERFORM app.assert_admin_for(v_import_unit_id);

  SELECT * INTO v_before FROM public.customers
  WHERE id = p_customer_id AND business_unit_id = v_import_unit_id
  FOR UPDATE;

  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'customer not found' USING errcode = 'P0002';
  END IF;

  IF v_before.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'archived customer cannot be edited' USING errcode = 'P2027';
  END IF;

  IF p_full_name IS NULL OR length(trim(p_full_name)) = 0 THEN
    RAISE EXCEPTION 'full_name is required' USING errcode = '22023';
  END IF;

  v_normalized_phone := app.normalize_import_phone(p_phone);

  IF v_normalized_phone IS NOT NULL THEN
    IF length(v_normalized_phone) < 9 OR length(v_normalized_phone) > 15 THEN
      RAISE EXCEPTION 'phone must be 9-15 digits (got %)', length(v_normalized_phone)
        USING errcode = '22023';
    END IF;
  END IF;

  BEGIN
    UPDATE public.customers SET
      full_name = trim(p_full_name),
      phone = v_normalized_phone,
      notes = p_notes,
      updated_at = now()
    WHERE id = p_customer_id AND business_unit_id = v_import_unit_id
    RETURNING * INTO v_after;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'active customer with this phone already exists'
      USING errcode = 'P2026';
  END;

  PERFORM app.write_audit_log(
    v_import_unit_id, 'update', 'customer', p_customer_id,
    jsonb_build_object('full_name', v_before.full_name, 'phone', v_before.phone, 'notes', v_before.notes),
    jsonb_build_object('full_name', v_after.full_name, 'phone', v_after.phone, 'notes', v_after.notes)
  );

  RETURN v_after;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Customer verification status — FOR UPDATE after auth
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_import_verify_customer_status(
  p_customer_id uuid,
  p_new_status text
)
RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
set search_path = ''
AS $$
DECLARE
  v_import_unit_id uuid;
  v_before public.customers;
  v_after public.customers;
BEGIN
  SELECT id INTO v_import_unit_id FROM public.business_units WHERE code = 'import';
  IF v_import_unit_id IS NULL THEN
    RAISE EXCEPTION 'import business unit is not provisioned' USING errcode = 'P0002';
  END IF;

  PERFORM app.assert_admin_for(v_import_unit_id);

  SELECT * INTO v_before FROM public.customers
  WHERE id = p_customer_id AND business_unit_id = v_import_unit_id
  FOR UPDATE;

  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'customer not found' USING errcode = 'P0002';
  END IF;

  IF v_before.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'archived customer cannot change status' USING errcode = 'P2027';
  END IF;

  IF p_new_status NOT IN ('pending_verification', 'new', 'returning') THEN
    RAISE EXCEPTION 'invalid customer status %', p_new_status USING errcode = 'P2032';
  END IF;

  UPDATE public.customers SET
    verified_customer_status = p_new_status,
    verified_by = CASE WHEN p_new_status IN ('new', 'returning') THEN auth.uid() ELSE null END,
    verified_at = CASE WHEN p_new_status IN ('new', 'returning') THEN now() ELSE null END,
    updated_at = now()
  WHERE id = p_customer_id AND business_unit_id = v_import_unit_id
  RETURNING * INTO v_after;

  PERFORM app.write_audit_log(
    v_import_unit_id, 'customer_verification_change', 'customer', p_customer_id,
    jsonb_build_object('verified_customer_status', v_before.verified_customer_status,
      'verified_by', v_before.verified_by, 'verified_at', v_before.verified_at),
    jsonb_build_object('verified_customer_status', v_after.verified_customer_status,
      'verified_by', v_after.verified_by, 'verified_at', v_after.verified_at)
  );

  RETURN v_after;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Customer archival — FOR UPDATE after auth
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_import_archive_customer(
  p_customer_id uuid
)
RETURNS public.customers
LANGUAGE plpgsql
SECURITY DEFINER
set search_path = ''
AS $$
DECLARE
  v_import_unit_id uuid;
  v_before public.customers;
  v_after public.customers;
BEGIN
  SELECT id INTO v_import_unit_id FROM public.business_units WHERE code = 'import';
  IF v_import_unit_id IS NULL THEN
    RAISE EXCEPTION 'import business unit is not provisioned' USING errcode = 'P0002';
  END IF;

  PERFORM app.assert_admin_for(v_import_unit_id);

  SELECT * INTO v_before FROM public.customers
  WHERE id = p_customer_id AND business_unit_id = v_import_unit_id
  FOR UPDATE;

  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'customer not found' USING errcode = 'P0002';
  END IF;

  IF v_before.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'customer is already archived' USING errcode = 'P2027';
  END IF;

  UPDATE public.customers SET
    archived_at = now(),
    updated_at = now()
  WHERE id = p_customer_id AND business_unit_id = v_import_unit_id
  RETURNING * INTO v_after;

  PERFORM app.write_audit_log(
    v_import_unit_id, 'archive', 'customer', p_customer_id,
    jsonb_build_object('full_name', v_before.full_name, 'phone', v_before.phone,
      'verified_customer_status', v_before.verified_customer_status),
    jsonb_build_object('archived_at', v_after.archived_at)
  );

  RETURN v_after;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Link customer to order — FOR UPDATE + conditional WHERE customer_id IS NULL
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_import_link_customer_order(
  p_order_id uuid,
  p_customer_id uuid
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
set search_path = ''
AS $$
DECLARE
  v_import_unit_id uuid;
  v_order public.orders;
  v_customer public.customers;
  v_order_phone text;
  v_customer_phone text;
  v_after public.orders;
BEGIN
  SELECT id INTO v_import_unit_id FROM public.business_units WHERE code = 'import';
  IF v_import_unit_id IS NULL THEN
    RAISE EXCEPTION 'import business unit is not provisioned' USING errcode = 'P0002';
  END IF;

  PERFORM app.assert_admin_for(v_import_unit_id);

  SELECT * INTO v_order FROM public.orders
  WHERE id = p_order_id AND business_unit_id = v_import_unit_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'order not found' USING errcode = 'P0002';
  END IF;

  IF v_order.customer_id IS NOT NULL THEN
    RAISE EXCEPTION 'order already has a customer linked' USING errcode = 'P2029';
  END IF;

  SELECT * INTO v_customer FROM public.customers
  WHERE id = p_customer_id AND business_unit_id = v_import_unit_id
  FOR UPDATE;

  IF v_customer.id IS NULL THEN
    RAISE EXCEPTION 'customer not found' USING errcode = 'P0002';
  END IF;

  IF v_customer.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'archived customer cannot be linked' USING errcode = 'P2027';
  END IF;

  v_order_phone := app.normalize_import_phone(v_order.customer_snapshot ->> 'phone');
  v_customer_phone := app.normalize_import_phone(v_customer.phone);

  IF v_order_phone IS NULL OR v_customer_phone IS NULL OR v_order_phone <> v_customer_phone THEN
    RAISE EXCEPTION 'phone mismatch between order and customer' USING errcode = 'P2028';
  END IF;

  PERFORM set_config('app.allow_order_status_change', '1', true);
  UPDATE public.orders SET
    customer_id = p_customer_id,
    updated_at = now()
  WHERE id = p_order_id
    AND business_unit_id = v_import_unit_id
    AND customer_id IS NULL
  RETURNING * INTO v_after;

  IF v_after.id IS NULL THEN
    RAISE EXCEPTION 'order was linked by another session' USING errcode = 'P2020';
  END IF;

  PERFORM app.write_audit_log(
    v_import_unit_id, 'update', 'order', p_order_id,
    jsonb_build_object('customer_id', v_order.customer_id),
    jsonb_build_object('customer_id', v_after.customer_id)
  );

  RETURN v_after;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Create customer from order — FOR UPDATE on order before checks
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_import_create_customer_from_order(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
set search_path = ''
AS $$
DECLARE
  v_import_unit_id uuid;
  v_order public.orders;
  v_normalized_phone text;
  v_existing_count bigint;
  v_existing_customer_id uuid;
  v_new_customer public.customers;
BEGIN
  SELECT id INTO v_import_unit_id FROM public.business_units WHERE code = 'import';
  IF v_import_unit_id IS NULL THEN
    RAISE EXCEPTION 'import business unit is not provisioned' USING errcode = 'P0002';
  END IF;

  PERFORM app.assert_admin_for(v_import_unit_id);

  SELECT * INTO v_order FROM public.orders
  WHERE id = p_order_id AND business_unit_id = v_import_unit_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'order not found' USING errcode = 'P0002';
  END IF;

  IF v_order.customer_id IS NOT NULL THEN
    RAISE EXCEPTION 'order already has a customer linked' USING errcode = 'P2029';
  END IF;

  v_normalized_phone := app.normalize_import_phone(v_order.customer_snapshot ->> 'phone');

  IF v_normalized_phone IS NULL THEN
    RAISE EXCEPTION 'order has no usable phone to create a customer' USING errcode = '22023';
  END IF;

  SELECT count(*), min(id::text)::uuid INTO v_existing_count, v_existing_customer_id
  FROM public.customers
  WHERE business_unit_id = v_import_unit_id
    AND app.normalize_import_phone(phone) = v_normalized_phone
    AND archived_at IS NULL;

  IF v_existing_count = 1 THEN
    PERFORM set_config('app.allow_order_status_change', '1', true);
    UPDATE public.orders SET
      customer_id = v_existing_customer_id,
      updated_at = now()
    WHERE id = p_order_id
      AND business_unit_id = v_import_unit_id
      AND customer_id IS NULL
    RETURNING id INTO v_order;

    IF v_order.id IS NULL THEN
      RAISE EXCEPTION 'order was linked by another session' USING errcode = 'P2020';
    END IF;

    PERFORM app.write_audit_log(
      v_import_unit_id, 'update', 'order', p_order_id,
      jsonb_build_object('customer_id', null),
      jsonb_build_object('customer_id', v_existing_customer_id)
    );

    RETURN jsonb_build_object('action', 'linked', 'customer_id', v_existing_customer_id);
  END IF;

  IF v_existing_count > 1 THEN
    RAISE EXCEPTION 'multiple active customers with this phone — resolve in Clientes'
      USING errcode = 'P2031';
  END IF;

  BEGIN
    INSERT INTO public.customers (
      business_unit_id, full_name, phone,
      verified_customer_status, verified_by, verified_at
    ) VALUES (
      v_import_unit_id,
      coalesce(trim(v_order.customer_snapshot ->> 'name'), 'Sin nombre'),
      v_normalized_phone,
      'new', auth.uid(), now()
    ) RETURNING * INTO v_new_customer;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'active customer with this phone already exists'
      USING errcode = 'P2026';
  END;

  PERFORM set_config('app.allow_order_status_change', '1', true);
  UPDATE public.orders SET
    customer_id = v_new_customer.id,
    updated_at = now()
  WHERE id = p_order_id
    AND business_unit_id = v_import_unit_id
    AND customer_id IS NULL
  RETURNING id INTO v_order;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'order was linked by another session' USING errcode = 'P2020';
  END IF;

  PERFORM app.write_audit_log(
    v_import_unit_id, 'create', 'customer', v_new_customer.id, null,
    jsonb_build_object(
      'full_name', v_new_customer.full_name, 'phone', v_new_customer.phone,
      'verified_customer_status', v_new_customer.verified_customer_status,
      'verified_by', v_new_customer.verified_by
    )
  );

  PERFORM app.write_audit_log(
    v_import_unit_id, 'update', 'order', p_order_id,
    jsonb_build_object('customer_id', null),
    jsonb_build_object('customer_id', v_new_customer.id)
  );

  RETURN jsonb_build_object('action', 'created', 'customer_id', v_new_customer.id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Phone helper grants — authenticated needs EXECUTE for index evaluation
-- ---------------------------------------------------------------------------
-- The partial unique index uses normalize_import_phone in its expression.
-- Direct INSERTs/UPDATEs by authenticated must evaluate it.
-- SECURITY DEFINER ensures the function body runs with owner privileges.

GRANT EXECUTE ON FUNCTION app.normalize_import_phone(text) TO authenticated;
