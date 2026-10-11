# Known Issues — CURRENT

Re-verified 2026-10-11 against Git, the Production DB (read-only), Vercel and
the code (2026-10-10 text below kept where still true). docs/current-v2.md is authoritative; docs/closure-report-2026-10-10.md
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
- `www.cruzial.pe` redirects to the apex with **308** (changed 2026-10-11).
- Monitoring (2026-10-11): Supabase health runs hourly and passes with a valid scoped token; alerts go to GitHub
  Issues (proven by the self-test). The Vercel monitor's `VERCEL_TOKEN` secret is rejected (403 invalidToken): open
  issue #81 stays open until the owner stores a new token (docs/monitoring.md, "One-time setup").
- Legacy root storefront is still published by GitHub Pages at `abel-castill0.github.io/cruzialparfums/` (old data;
  CodeQL #1/#6 are there). Recommended: Settings → Pages → Unpublish/disable (owner decision).
- Vercel env `CRUZIAL_PRODUCTION_CUTOVER_APPROVED` is no longer read (retired by #77); removing it is optional and
  removes it from every target at once.
- Next.js out-of-band security release announced for 2026-10-14 (upstream
  dependencies, 2 Critical + 1 High). 16.4.0 includes every fix published so
  far; upgrade as soon as the patched version is out.
- Dependabot #10 (TypeScript 7) cannot be installed: typescript-eslint supports TypeScript < 6.1. PR #59 moves to
  TypeScript ~6.0.3 and Dependabot ignores >= 6.1.0 until typescript-eslint supports 7 (remove the ignore then).
- `braces` GHSA-vfj7-8cjw-p6xm: dev-only lint tooling, no patched release.
- **Password-recovery e-mail is NOT deliverable today (2026-10-11).** Supabase Auth has no custom SMTP; the built-in
  mailer sends only to **members of the Supabase organization** (rate limit 2/hour), and the organization has a single member
  who is not the admin's login address (checked by hash comparison, no addresses recorded). `/recover` itself answers 200
  (generic message by design) and builds the link from `https://cruzial.pe/auth/callback`, but delivery to the admin cannot
  happen until an SMTP provider is configured (Dashboard → Authentication → SMTP; needs the provider's credentials — external
  requirement) or the admin address is added as an organization member. Do not report recovery as verified before a real
  e-mail arrives.
- Supabase Auth `uri_allow_list` no longer contains `localhost`/`127.0.0.1` (2026-10-11).
- Supabase legacy API keys disabled 2026-10-11 (re-enable path in docs/credential-rotation-plan.md §7); the legacy HS256
  signing key is still "previously used" until the owner revokes it.
- GitHub scheduled workflows are best effort: today runs were 40-95 min late and most hourly slots were dropped; the
  monitors now have two off-peak slots per hour. A strict cadence needs an external scheduler.
- Owner-session checks still pending (docs/owner-verification-runbook.md):
  admin MFA, password recovery email, Cloudinary upload in Production.

- GitHub (2026-10-11): secret scanning, push protection, Dependabot alerts/security updates and `master` branch
  protection (PR + 5 required checks) are enabled; CodeQL keeps 2 accepted SHA-1 findings (Cloudinary protocol) and
  2 in the out-of-scope legacy `assets/app.js`.
- Hosted QA needs `--reset` before each full run (serial Gate B specs consume their order).

## Public cutover

- Indexing is closed because the owner switch (Admin → Operaciones → "Permitir indexación en buscadores") is OFF
  (default). Missing content is a warning next to the switch, not a lock; `public_launch_ready()` stays a factual
  report (`false` today).
- Cutover window, legal facts and Import policies are owner/client decisions.

Historical incidents live in Git history and are not active V2 issues.
