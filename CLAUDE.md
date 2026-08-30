# CLAUDE.md — Cruzial Parfums

Project rules for anyone (human or AI) making changes to this repo. These are not
style preferences — they are constraints established after real errors were caught
in this project (invented commercial claims, duplicated/conflicting data across
files). Follow them on every change, not just when reminded.

## ZERO INVENTED COMMERCE

Never invent:
- prices
- discounts
- bestseller status
- customer testimonials
- demand claims
- stock
- product availability
- wholesale tiers
- guarantees
- authenticity claims
- product performance claims

When source is unavailable:
- omit it
- mark as consult
- or classify as editorial copy

Never convert derived values into factual commercial claims without validation.

Authenticity claims are commercial claims. "100% originales" and language like
it are not exempt because they read as operational description rather than a
number or a status — they require explicit client confirmation or a documented
source, exactly like a price or a bestseller flag. Do not treat a claim as
safe just because it isn't quantitative.

**In practice:** if you cannot point to where a commercial fact came from (the
client, `assets/data.js`, an official price list), it does not go on the site as
fact. Use "Consultar" / WhatsApp handoff, or write it as clearly editorial
framing, never as a stated number or status.

## SINGLE SOURCE OF TRUTH

`assets/data.js` must be the canonical source of:
- products
- categories
- prices
- sizes
- discontinued status
- combos
- commercial metadata

README documents. HTML presents. Do not maintain independent commercial
figures across multiple files when they can be derived from `data.js`.

**In practice:** counts, prices, and product-status figures that appear in
`README.md` or in page copy must be derived from `assets/data.js` (ideally by
actually counting the array, not by memory/estimate) — never hand-maintained as
a separate number that can drift out of sync. `README.md` is descriptive only
and never authoritative for product data — it summarizes `data.js`, it does
not compete with it. When the two disagree, `data.js` is right and the README
is stale; fix the README, never the other way around.

## Working conventions this project uses

- **Data provenance tagging:** when auditing or adding commercial data, classify
  its source as `OFFICIAL_PDF | CLIENT_CONFIRMED | DERIVED_VALIDATED |
  MARKETING_COPY | UNKNOWN`. Anything `UNKNOWN` is a candidate for omission or
  "Consultar", not for publishing as fact.
- **No build step.** This is a static multi-page site (no bundler, no
  `package.json`). Verify changes by serving the folder locally
  (`python -m http.server`) and checking in-browser — there is no compile step
  to catch mistakes for you.
- **Phased changes.** Structural/visual changes land in small, independently
  verifiable phases with their own commit — not one large rewrite.
- **Perfume Finder scoring is not a ZERO INVENTED COMMERCE violation.**
  `assets/finder.js` classifies olfactory families into general moods/
  intensity tiers (`FAMILY_TRAITS`) to power the "Encuentra tu fragancia"
  recommender. That table is documented industry convention (the same
  family→mood grouping every fragrance reference site uses), applied equally
  to any product of that family — it is not a per-product fact and does not
  get added to `data.js`. The scoring itself only reads real product fields
  (`family`, `notes`, `conc`, `gender`) that already exist. Do not add
  per-product `intensity`/`sweetness`/`freshness` scores to `data.js` — if the
  Finder needs a new signal, it must be derived transparently at runtime from
  confirmed fields, the same way, never hand-authored per product.
