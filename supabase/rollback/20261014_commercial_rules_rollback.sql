-- Rollback of 20261014120000_commercial_rules.sql. Destroys the data in the three tables and the two order columns
-- (the gift choice and the quoted shipping cost of existing orders). Run only on purpose.
begin;

drop function if exists public.calculate_mixed_wholesale_quote(text, jsonb);
drop function if exists public.attach_parfums_order_gift(uuid, uuid);
drop function if exists public.admin_parfums_set_order_shipping_cost(uuid, integer);
drop function if exists public.admin_delete_promotion_rule(text, uuid);
drop function if exists public.admin_save_promotion_rule(text, uuid, timestamptz, text, jsonb, jsonb, boolean);
drop function if exists public.admin_delete_shipping_agency(text, uuid);
drop function if exists public.admin_save_shipping_agency(text, uuid, timestamptz, text, text, text, boolean);
drop function if exists public.admin_delete_delivery_zone(text, uuid);
drop function if exists public.admin_save_delivery_zone(text, uuid, timestamptz, text, boolean);

alter table public.orders drop constraint if exists orders_shipping_cost_cents_check;
drop index if exists public.orders_gift_product_id_idx;
alter table public.orders drop column if exists gift_product_id, drop column if exists shipping_cost_cents;

drop table if exists public.promotion_rules;
drop table if exists public.delivery_zones;
drop table if exists public.shipping_agencies;
drop function if exists app.validate_promotion_rule();

commit;
