# Known Issues — CURRENT

Re-verified 2026-10-10 against Git, the Production DB (read-only), Vercel and
the code. docs/current-v2.md is authoritative; docs/closure-report-2026-10-10.md
holds the evidence for this pass.

## Product / commercial (business facts, not engineering gaps)

- Parfums launch readiness, Production 2026-10-10: once migration
  20261010120000 is applied, the remaining catalog blockers are 5 bottle variants
  held in draft and 1 draft product:
  - legacy price without a credible source: `1-million-lucky`,
    `by-the-fireplace`, `le-beau-le-parfum`;
  - identity/concentration or size conflict: `victory-elixir`,
    `cedrat-boise-int`;
  - `le-male-le-parfum` (draft: brand/gender/photo unknown).
  The owner either confirms each fact or archives the variant/product in Admin.
  (`bir-intense` is no longer blocked; `invictus-elixir` is archived and, after
  20261010120000, no longer counted.)
- The 3 combo compositions (Cuarteto Oriental, Vainilla Freak, Set Tulum) are
  `official_pdf` and published; they are not readiness blockers.
- Exact inventory model unknown (no stock numbers are invented).
- Import: campaign #8 is `scheduled` (estimated opening 2026-10-15 00:00 Lima)
  with 898 offers all `unconfirmed`; purchases stay disabled until the client
  confirms prices/availability and an admin opens the campaign.

## Media

- Parfums products without a primary photo (honest "Foto próximamente"
  fallback, not a blocker): `lovely-cherry`, `royal-blend-sequoia`,
  `sceptre-malachite` (CLIENT_ASSET_MISSING), `le-male-le-parfum` (draft).
- Liquid Brun and Versace Eros EDP client media remain ambiguous.
- Cuarteto Oriental / Vainilla Freak files are orphan assets.
- Import: 844 products have no primary photo; Import readiness requires them.

## Legal / contact (both units)

- `business_legal` is empty: legal name, RUC, address, claims email/phone,
  exchange policy and payment-methods note. Never invented; readiness blocks.

## Infrastructure / operations

- WhatsApp Cloud API: no Meta credentials; webhook fails closed (503
  `not_configured`), manual `wa.me` coordination works.
- Supabase Free plan: no managed backups, no leaked-password protection, 24 h
  dashboard logs. Manual backup + restore proven 2026-10-09.
- Vercel request logs are short-lived on the current plan; the daily cron run
  can only be evidenced through `automation_worker_health`.
- `www.cruzial.pe` redirects to the apex with 307; switch to 308 at cutover.
- Next.js out-of-band security release announced for 2026-10-14 (upstream
  dependencies, 2 Critical + 1 High). 16.4.0 includes every fix published so
  far; upgrade as soon as the patched version is out.
- Dependabot #10 (TypeScript 7) blocked upstream: typescript-eslint supports
  TypeScript < 6.1.
- `braces` GHSA-vfj7-8cjw-p6xm: dev-only lint tooling, no patched release.
- Owner-session checks still pending (docs/owner-verification-runbook.md):
  admin MFA, password recovery email, Cloudinary upload in Production.

## Public cutover

- Indexing is closed on purpose: robots `Disallow: /`, empty sitemap, `noindex`
  on every page, `public_launch_ready() = false`.
- Cutover window, legal facts and Import policies are owner/client decisions.

Historical incidents live in Git history and are not active V2 issues.
