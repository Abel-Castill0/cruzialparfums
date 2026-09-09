# 4H2A — Public catalog repository foundation

Status: complete (repository/read-model/parity readiness only). The public
runtime remains `LegacyCatalogRepository`; no product was published.

## Legacy coupling classification

| Class | Current consumers | 4H2A decision |
| --- | --- | --- |
| A — public presentation | Home, catálogo, Finder, product detail | Provider-neutral `CatalogProduct`/`PublicCatalogRepository` are ready; runtime unchanged. |
| B — cart | cart pricing/components and checkout page hydration | Contract-compatible, but stays legacy until the display and authority switch atomically. |
| C — checkout/order validation | `parfums-order-request.ts`, checkout action | Must remain legacy in 4H2A. 4H2B must switch it in the same release as presentation; no hybrid price truth. |
| D — legacy redirects | proxy and `legacy-route-resolver` | `findByLegacyId` is supported without exposing database UUIDs. Runtime unchanged. |
| E — wholesale | mayorista page and wholesale catalog/policy | Legacy tiers remain parity-only. Current Supabase policy proves confirmed category discounts, but not the legacy `unit/m4/m12` presentation. No switch. |
| F — combos | combos page, home carousel, combo builder | Three compositions are unconfirmed and absent from Supabase. `listCombos()` intentionally returns none. No switch. |
| G — metadata/SEO | product metadata, structured data | Provider-neutral product fields are ready after legitimate publication; runtime unchanged. |
| H — config/contact | layout, home, checkout, contact, nosotros, terms/privacy, mayorista/combos | Typed public `public_contact` reader is ready. Static settings and legacy storefront config remain active to avoid a partial switch. |

Tests and fixture-only consumers of `LegacyCatalogRepository` remain legacy by
design; they protect current parity and are not runtime coupling to migrate
blindly.

## Read model and safety

- `SupabasePublicCatalogRepository.load()` accepts a caller-supplied normal
  Supabase client. It has no secret/service-role factory or draft bypass.
- One composed PostgREST query reads products, public variants, category axes
  and media. List, detail and related operations reuse the in-memory mapped
  result, so there is no per-card/per-product query.
- The query is scoped to the fixed Parfums unit, `published`, and unarchived
  products. The pure mapper repeats those checks as defense in depth. RLS
  remains the authoritative boundary for products and all joined rows.
- Only the required `notes` and `tag` JSON paths are projected from `specs`;
  arbitrary specs/admin JSON and inventory are not selected.
- Variants retain canonical two-decimal `priceAmount` text and their actual
  verification provenance. The numeric price maps are compatibility
  projections for the unchanged storefront contract.
- Commercial category `arabic` is normalized to the existing stable public
  semantic `arab`; designer/niche map directly. A missing, unpublished,
  cross-unit or unsupported classification refuses the product.
- Media is limited to active HTTPS Cloudinary `secure_url` rows, sorted primary
  first and then deterministically. A narrow `metadata->>media_role` projection
  preserves distinct `set`/`bottle` display images with primary/first fallback.
  Missing media is represented by an empty collection/null image, with no web
  or local-image fallback.
- The parity oracle treats a legacy product absent from public Supabase as
  `EXPECTED_BLOCKED`, but a public Supabase-only product as a
  `REAL_MAPPING_BUG`; the two directions are intentionally asymmetric.
- The current hosted anonymous result is correctly zero Parfums products.

## 4H2B readiness matrix

| Area | State | Requirement before cutover |
| --- | --- | --- |
| Repository, list/detail/related, legacy identity, SEO fields | READY | Code wiring only, after publication prerequisites. |
| Public RLS and business-unit isolation | READY | No policy bypass; keep anonymous verification in the cutover gate. |
| Variant kinds, sizes, labels and exact price mapping | READY technically | Publication action plus client commercial confirmation: all current prices still have `legacy` verification. |
| Migrated media mapping | READY for reconciled rows | Media assets/confirmation for unresolved products; do not substitute internet images. |
| Featured rank/window | READY technically | Client curation/publication action if the rail should contain products. |
| Public contact reader | READY | Code wiring can replace static values atomically with the storefront switch. |
| Products/categories/variants visible publicly | BLOCKED | Publication action after commercial review; staging currently has zero published products/categories/variants. |
| Prices as commercial truth | BLOCKED | Client commercial confirmation, then publication action. |
| Combos | BLOCKED | Client commercial confirmation of all three compositions, code/data work, then publication action. |
| Wholesale legacy tier parity | BLOCKED | Client commercial confirmation and code/data work; current confirmed discount policy is not the same representation as legacy tiers. |
| Checkout/order authority | BLOCKED | Code work in 4H2B: validate with the same selected repository/source as storefront in one atomic release and update snapshot source semantics. |
| Unresolved media | BLOCKED where affected | Client media asset/identity confirmation (including `sceptre-malachite` missing asset). |

An actual 4H2B source switch is therefore **not ready**. Publication, price
authority, combos, wholesale and checkout alignment are deliberate gates, not
repository bugs.
