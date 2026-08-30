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
- **`.active` vs `.open` — check both before touching `index.html`/`catalog.html`/
  `mayorista.html`'s local `<style>` blocks.** These three pages embed a full
  parallel design system on top of `assets/styles.css`. app.js/finder.js toggle
  `.open` to show `.search-panel`, `.mobile-menu`, `.finder-modal`, `.drawer`;
  the local styles in some of these pages were written expecting `.active`
  instead, which silently made the mobile menu and search completely
  non-functional (fixed 2026-08-30) despite `position:sticky`-style CSS looking
  correct at a glance. When a local block partially overrides a shared class,
  check what it does NOT override — those properties leak through from
  `assets/styles.css` and can surprise you (a stray `background`/`padding` on
  `.hero-copy`/`.brand-mark`/`.wholesale-filters` caused three separate bugs
  this way). This is symptom-level firefighting, not a fix for the root cause;
  unifying the two design systems is still open, larger, unscheduled work.
- **Service worker (`sw.js`) is network-first for HTML**, not
  stale-while-revalidate — a cached page showing an old price after a deploy is
  the same class of problem as inventing one. Bump `CACHE_VERSION` when you
  change `sw.js` itself so old clients pick up the new logic.
- **bfcache**: `app.js` fades the page out (`page-exit out` class) before
  navigating away on a normal click. Restoring that page via the browser's
  "back" button from bfcache does NOT re-fire `DOMContentLoaded`, so a
  `pageshow` listener (`e.persisted`) clears those classes — don't remove it,
  the symptom without it is "back button shows a blank page until F5".
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
- **perfumes-enteros.html:** Redirects to `mayorista.html`. Has `noindex, nofollow`
  and `meta http-equiv="refresh"`. Retail single-bottle purchase does NOT live
  here — it's a catalog-card link (`product.html?id=...&variant=bottle`) that
  pre-selects the existing FRASCO COMPLETO size row on the product page.
  Mayorista is reserved for genuine bulk/volume orders only; don't route a
  single-bottle retail flow through it.
- **No newsletter form.** Removed during redesign — no backend service configured.
- **WhatsApp is the primary CTA** on every page (header icon, floating button,
  checkout flow). No payment gateway.

## Product photography — read before touching any image

- **`img/perfumes/*.png` (repo root, untracked-until-added) are the CLIENT'S
  ORIGINAL studio photos — white background, full bottle, correct.** They exist
  because an earlier round's automatic background removal (flood-fill) ate
  parts of clear/glass bottles; the client re-uploaded clean originals to
  replace the damaged set. **Never run background removal, flood-fill, or
  content-cropping on these again.** The white background is intentional, not
  a defect to fix with more processing.
- **`img/perfumes/webp/*.webp`** is the deployed, optimized copy (resized to
  1100px max side, WebP quality 88 — pure format/size conversion, zero content
  change; see `.claude/scripts/migrate_new_photos.py`). `data.js`'s `IMG_MAP`
  points here. One product (`sceptre-malachite`) still points at the old
  `img/perfumes/transparent/` path — no new photo was provided for it yet.
- **`.card-media.has-photo`/`.product-stage.has-photo` use `object-fit:contain`**,
  not `cover` — these photos have real white backgrounds meant to be shown in
  full, not cropped edge-to-edge. Small thumbnails (mayorista table, combo
  picker, search results, cart/drawer) still use `cover`, which is fine at
  that size.
- **`img/hero/hero2.png`/`.webp`** is the homepage hero background (full-bleed,
  `.hero` in `index.html`) — client-provided, do not regenerate or reprocess.

## Working style for this project

Sessions run long; treat context as a budget. Verify claims (an old audit, a
prior round's assumption) against the current file/DOM state before acting on
them — don't re-fix what's already fixed, and don't trust a claim just because
it's specific. Prefer one focused, well-verified change over a sweeping
rewrite across many files in one pass; commit in atomic, reviewable batches
matching what was actually verified, not the whole task at once.
