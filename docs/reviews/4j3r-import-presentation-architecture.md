# 4J3R — Import presentation architecture finding

## Existing constraints

The current catalog schema makes `product_variants.price_amount` mandatory and restricts `variant_kind` to `decant` or `bottle`. Import's `campaign_products` correctly owns campaign price and availability and may reference a variant, but its uniqueness constraint permits only one row for a given campaign/product/variant combination. The Sexto Consolidado contains structural bottle presentations, 60 products with multiple priced presentations, and 32 packs/sets that are not Parfums combos.

## Options compared

| Option | Shape | Benefit | Material problem | Finding |
|---|---|---|---|---|
| 1. Reuse `product_variants` unchanged | Product + `bottle` variants; repeat campaign price in both variant and `campaign_products` | No schema change | Duplicates campaign truth into a mandatory base price; `decant`/`bottle` vocabulary cannot faithfully describe sets and mixed packs | Reject |
| 2. Product per presentation | Each 50 ml/100 ml/pack becomes a separate product; campaign price stays in `campaign_products` | Works with current tables | Fragments canonical identity, weakens cross-campaign reconciliation, and turns presentation changes into duplicate products | Reject |
| 3. Structural Import presentation + campaign offer | Canonical `products`; a price-free Import presentation entity; campaign-scoped offer rows hold price/availability and point to the presentation | Preserves identity, supports multi-presentation products and packs, keeps campaign commerce in one place | Requires an additive migration and corresponding Import repository/UI work in a later authorized phase | Recommend |

## Recommended V1 model

Use one canonical Import product for identity and brand. Add a price-free structural presentation entity for Import with a stable label, optional capacity, presentation class (`single_fixed`, `multi_presentation`, `pack_set`, `ambiguous`), and source-backed pack composition metadata. Campaign offer rows reference that presentation and remain the sole commercial owner of campaign price, currency, availability, quantity limit, and ordering.

For a single fixed presentation, one structural presentation is still useful when a source capacity exists. For multiple presentations, create one structural presentation per source option and one campaign offer per priced option. For packs/sets, represent the offer as an Import pack/set presentation with evidence metadata; never create a `public.combos` row. For unresolved presentation evidence, retain the source occurrence without publishing it.

This phase intentionally does not add or alter a migration. Before 4J4, the additive design should decide whether to generalize/replace `product_variants` or introduce an Import-only presentation table, then update the campaign-offer uniqueness rule so multiple presentations of one canonical product remain representable without duplicating product identity.
