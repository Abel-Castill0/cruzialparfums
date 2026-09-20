-- Release: covering indexes for the 16 unindexed foreign keys reported by
-- Supabase's Performance Advisor (unindexed_foreign_keys lint) on this
-- project. Every one of these FKs is exercised by an existing join, delete
-- cascade check, or admin lookup (order lines by product/variant/campaign
-- offer, campaign_products by product/variant/import presentation, combo
-- items by variant, orders by campaign/shipping method, and the four
-- updated_by/verified_by actor lookups). No index is added for a column that
-- isn't actually an FK the linter flagged, and no existing index is touched.

create index if not exists campaign_products_import_presentation_id_idx
  on public.campaign_products (import_presentation_id);
create index if not exists campaign_products_product_id_idx
  on public.campaign_products (product_id);
create index if not exists campaign_products_product_variant_id_idx
  on public.campaign_products (product_variant_id);

create index if not exists combo_items_combo_product_variant_id_idx
  on public.combo_items (combo_product_variant_id);
create index if not exists combo_items_product_variant_id_idx
  on public.combo_items (product_variant_id);

create index if not exists customers_verified_by_idx
  on public.customers (verified_by);

create index if not exists inventory_updated_by_idx
  on public.inventory (updated_by);

create index if not exists order_lines_campaign_product_id_idx
  on public.order_lines (campaign_product_id);
create index if not exists order_lines_import_presentation_id_idx
  on public.order_lines (import_presentation_id);
create index if not exists order_lines_product_id_idx
  on public.order_lines (product_id);
create index if not exists order_lines_product_variant_id_idx
  on public.order_lines (product_variant_id);

create index if not exists orders_campaign_id_idx
  on public.orders (campaign_id);
create index if not exists orders_shipping_method_id_idx
  on public.orders (shipping_method_id);

create index if not exists product_media_product_variant_id_idx
  on public.product_media (product_variant_id);

create index if not exists settings_updated_by_idx
  on public.settings (updated_by);

create index if not exists variant_price_tiers_wholesale_policy_id_idx
  on public.variant_price_tiers (wholesale_policy_id);
