# Known Issues — CURRENT

Cross-check against docs/current-v2.md before relying on any count below;
this file summarizes, current-v2.md is authoritative.

## Product / commercial

- 4 bottle-price variants remain legacy/unconfirmed (1-million-lucky,
  by-the-fireplace, le-beau-le-parfum, bir-intense); the other 20 previously
  legacy bottles now carry a provisional_market reference price (see
  docs/current-v2.md 4K-B2B.3).
- The 3 combo compositions (Cuarteto Oriental, Vainilla Freak, Set Tulum) are
  materialized locally with official_pdf composition (4K-C2); they remain
  draft/unpublished, not "pending reconfirmation".
- Exact inventory model unknown.

## Media

- sceptre-malachite: CLIENT_ASSET_MISSING.
- Liquid Brun client media remains ambiguous.
- Versace Eros EDP client media remains ambiguous.
- lovely-cherry and royal-blend-sequoia have no reconciled client PNG.
- Cuarteto Oriental Vainilla Freak files are orphan assets.

## Infrastructure

- REMOTE_AUTH_URL_CONFIG_PENDING_PREVIEW.
- Real Lighthouse/Web Vitals require Vercel Preview.
- Production admin bootstrap/MFA/recovery not finalized.
- Import catalog, campaigns, Admin and public ordering are already
  implemented (see docs/current-v2.md 4J5G-A3/4J5G-B); remaining Import gaps
  are the documented UNKNOWN policies (returns/lead-time/final order states)
  in docs/client-decisions.md, not missing capabilities.

## Public cutover

- Public storefront still uses LegacyCatalogRepository/assets/data.js.
- Production/DNS/indexing not authorized.

Historical incidents live in Git history and are not active V2 issues.
