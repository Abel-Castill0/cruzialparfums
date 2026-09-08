# Client Decisions — CURRENT

Latest decision wins.

UNKNOWN is never a business rule.

## Platform

- One platform: `/`, `/parfums`, `/import`, `/admin`; shared infrastructure and
  auth, but business data, carts, orders, settings and campaigns stay isolated.
- V1 auth is admin-only; there is no public signup.
- Parfums palette: black/white with restrained gold. Import: deep navy/white/
  silver; it is not a recolored Parfums surface.
- Public contact and admin bootstrap are separate concerns; bootstrap identity
  must never be exposed or treated as storefront contact data.

## Parfums

Contact:

- WhatsApp: +51 926 390 591
- email: dominiocruzial@gmail.com

Shipping:

- Shalom only

Payments:

- no website payment in V1
- order request → WhatsApp coordination

Claims:

- decants come from authentic official-house bottles: CLIENT_CONFIRMED
- never invent testimonials, demand/bestseller claims, stock or guarantees

Wholesale:

- scope: per_commercial_type
- threshold: 40 units
- arabic: -S/5
- designer: -S/7
- niche: -S/10
- full bottles only

Product corrections:

| legacy id | current identity/classification/state | provenance |
| --- | --- | --- |
| `red-intensely` | Dumont Paris / Nitro Red Intensely | CLIENT_CONFIRMED + DERIVED_VALIDATED |
| `reserve-privee` | Givenchy / Gentleman Réserve Privée | CLIENT_CONFIRMED + DERIVED_VALIDATED |
| `purple-melancholia` | Valentino / designer | CLIENT_CONFIRMED |
| `bir-intense` | hidden | CLIENT_CONFIRMED |
| `cdn-preciux-i` | Club de Nuit Precieux I | DERIVED_VALIDATED |
| `amber-o-gold-e` | Amber Oud Gold Edition | DERIVED_VALIDATED |
| `supremacy-noi` | Supremacy Not Only Intense | CLIENT_CONFIRMED |
| `1-million-lucky` | One Million Lucky | CLIENT_CONFIRMED + DERIVED_VALIDATED |

Availability:

- discontinued != unavailable
- no current evidence of out_of_stock

Promotion:

- free 2ml decant applies only to full bottle

Storefront interaction:

- product cards allow quantity selection with normal cart merge rules
- Combo Builder size is per fragrance/line, never one global size

## Import

Deposit:

- new customer: 50%
- returning customer: 70%
- status verified server/admin-side

Shipping:

- private_delivery

Consolidados:

- one campaign per consolidado
- preserve historical campaigns
- products/prices/availability may differ by campaign

## Media

- preserve originals
- no automatic background removal
- sceptre-malachite: CLIENT_ASSET_MISSING

## UNKNOWN / requires decision

- production admin MFA/recovery/bootstrap process
- exact inventory model
- 24 bottle prices commercial approval
- 3 combo compositions
- Import catalog/categories, currencies, taxes and price-display policy
- final order states, transitions, cancellation and operational ownership
- campaign automatic transitions/timezone, concurrent campaigns and numbering
- Import legal/returns/refund/guarantee/shipping/lead-time rules
- waitlist fields, consent, channel and retention
- PII/audit retention and archive/hard-delete policy
- CSV match key, approver and conflict/unmatched policy
- analytics/cookie policy
- outbound email provider/templates and sender domain
- whether PWA/offline remains in V2
- whether the client meant a separate base “One Million” product; none exists now
- whether the “Précieux” or “Amber Gold Elixir es E.” notes imply any further
  correction beyond the confirmed rows above
- Production cutover window
