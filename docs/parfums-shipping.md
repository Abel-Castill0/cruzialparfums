# Parfums shipping

Updated 2026-10-03, on the owner's relay of the client's request. This
supersedes the "Shipping: Shalom only" line in `docs/client-decisions.md`. That
file is fingerprinted by the C2 reconciliation artifact and a DB source-hash
migration, so it must be updated together with them by whoever owns migrations;
this change deliberately does not touch it.

## Delivery methods

- **Shalom**: the customer picks any agency in checkout (district map, search,
  or "my agency is not listed" for other cities).
- **Motorizado (Lima)**: quoted and agreed over WhatsApp. The web shows no fee.
  An order is stored with `shippingMethodCode = null`.

The chosen agency travels inside the order's `delivery` text because the order
RPC accepts only `district`, `delivery` and `note`. The server accepts only
values derived from `domains/orders/parfums-delivery.ts`.

## Data that needs confirmation

- `domains/orders/lima-districts.ts` — districts where the motorizado does not
  reach every zone. PROVISIONAL: derived from the eight Lima districts the
  government placed under a state of emergency for crime in 2025. No official
  courier list exists, and the 2026 decrees cover all of Lima and Callao. The
  client must confirm or replace it. Customers see neutral wording ("acceso
  restringido"); it never blocks an order.
- `domains/orders/shalom-agencies.ts` — 145 agencies transcribed from an
  unofficial directory (see the file header). UNVERIFIED until the owner checks
  them against Shalom. Orders are confirmed over WhatsApp before dispatch.

## Not changed

Legal pages (privacy still names only Shalom as carrier): proposal for legal
review.
