-- Cruzial Platform V2 — Audit log
--
-- Append-only for application roles. An admin can write entries and read their
-- own unit's history, but must not be able to edit or delete what they did —
-- otherwise the log cannot be used to answer "who changed this price".
--
-- Enforcement is layered, because RLS alone is not enough here: RLS denies
-- UPDATE/DELETE for anon/authenticated by simply having no such policy, and the
-- trigger below additionally blocks UPDATE/DELETE for *any* role that is not
-- the table owner — so a future permissive policy, or a careless call made with
-- the secret key, still cannot rewrite history silently.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid references public.business_units (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  request_id text,
  created_at timestamptz not null default now(),
  constraint audit_log_action_check check (
    action in (
      'create', 'update', 'archive', 'restore', 'publish', 'unpublish',
      'price_change', 'inventory_change', 'campaign_state_change',
      'order_state_change', 'settings_change', 'membership_change',
      'customer_verification_change'
    )
  )
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_business_unit_idx on public.audit_log (business_unit_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_user_id, created_at desc);

create or replace function app.reject_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  -- Unconditional, including for the table owner and for anything holding the
  -- secret key. There is no escape hatch here on purpose: a conditional
  -- exemption is exactly the thing an attacker (or a careless script) would
  -- reach for. Retention pruning, once docs/client-decisions.md defines a
  -- policy, must arrive as its own migration that deliberately drops and
  -- recreates this trigger — a change that is reviewable in Git rather than a
  -- runtime setting nobody notices.
  raise exception 'audit_log is append-only (attempted % by %)', tg_op, session_user
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function app.reject_audit_log_mutation();

create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function app.reject_audit_log_mutation();

revoke all on function app.reject_audit_log_mutation() from public;

comment on table public.audit_log is
  'Append-only administrative history. Retention/pruning policy is UNKNOWN in docs/client-decisions.md; until it is confirmed, nothing deletes from this table.';
comment on column public.audit_log.before is
  'Previous values of the changed columns only. Do not store credentials, tokens, or PII that the change itself did not touch.';
