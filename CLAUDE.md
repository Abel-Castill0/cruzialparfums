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

## Confirmed claims log

Claims that required explicit client confirmation under ZERO INVENTED COMMERCE,
and the outcome, so they aren't re-flagged as unverified on a future audit:

- **"100% originales / 100% auténticos"** (announcement bars, hero badge, FAQ,
  default product `desc` in `data.js`, `nosotros.html` "Originalidad absoluta"):
  **CLIENT_CONFIRMED** — confirmed by the business owner on 2026-08-30 that
  decants are prepared from authentic bottles of the official houses. Safe to
  keep as stated; do not soften without a new instruction from the client.
- **Fake testimonials** (`index.html`, "Experiencias reales" — three 5-star
  reviews with invented names/cities/order counts): removed on 2026-08-30, no
  documented source existed. Replaced with an editorial "Nuestro compromiso"
  block describing the real prep/advisory/shipping process — no names, no
  ratings, nothing presented as a customer quote. If real testimonials are
  collected later (WhatsApp screenshots, Instagram reviews), reintroduce them
  citing the actual source, not generic names.

## Site architecture

- **Navigation:** `CRUZIAL | CATÁLOGO | ARMA TU COMBO | MAYORISTA` (header). Secondary
  links (Nosotros, FAQ, Contacto) live in the footer and mobile menu only.
- **Footer:** 4-column layout (Brand, Explorar, Ayuda, Legal) with social links
  and WhatsApp direct link.
- **Mobile menu:** Primary links (Catálogo, Arma tu combo, Mayorista) + separator +
  secondary links (Nosotros, FAQ, Contacto).
- **FAQ:** Lives in `index.html#faq` (6 accordion items). Footer links point to
  `index.html#faq`, not `nosotros.html#faq`.
- **combos.html:** Dedicated page for pre-built sets ("Sets ya armados") and
  the combo builder ("Arma tu propio combo"). Replaced the combo sections that
  were previously in catalog.html.
- **perfumes-enteros.html:** Redirects to `mayorista.html` (full bottles are now
  in the Mayorista section). Has `noindex, nofollow` and `meta http-equiv="refresh"`.
- **No newsletter form.** Removed during redesign — no backend service configured.
- **WhatsApp is the primary CTA** on every page (header icon, floating button,
  checkout flow). No payment gateway.
