-- Gate B: covering indexes for the 3 unindexed foreign keys reported by
-- Supabase's Performance Advisor (unindexed_foreign_keys lint) after the
-- Gate B migrations. business_unit_id backs every per-unit admin summary
-- and count query (admin_operations_summary, publication readiness); the
-- FK itself also needs it to avoid a full-table scan on any future
-- business_units delete/update check. actor_user_id backs any future
-- "actions by this admin" audit lookup and the auth.users FK check.

create index if not exists inventory_reservations_business_unit_id_idx
  on public.inventory_reservations (business_unit_id);

create index if not exists order_status_events_business_unit_id_idx
  on public.order_status_events (business_unit_id);

create index if not exists order_status_events_actor_user_id_idx
  on public.order_status_events (actor_user_id);
