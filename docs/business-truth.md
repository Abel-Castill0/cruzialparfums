# Business truth, external blockers and public release / SEO

> Moved verbatim from `CLAUDE.md` on 2026-10-11 to keep that file small. Section numbers are the original ones
> (`CLAUDE.md` keeps the index). Never invent business facts. Sections 16, 17 and 21 of the former CLAUDE.md, unchanged (including the 2026-10-01 owner delegation).

---

# 16. Business truth

## Current owner delegation — reversible launch merchandising (2026-10-01)

The owner has expressly delegated initial, reversible merchandising choices to
Claude so the site can launch and the owner can refine them later in Admin.
This specific instruction overrides the default prohibition on choosing
commercial values, but only within this scope:

- Set temporary launch prices from the repository's documented Peru market
  research. Keep the chosen source/value and `owner_selected_provisional`
  provenance visible in the existing audit/admin workflow. Never label these
  values client-confirmed or official. If the current data model blocks
  publication, implement the narrowest auditable owner-approved path; do not
  weaken RLS, authorization, or existing trusted-source rules.
- Choose safe display ordering and presentation labels when supported by known
  catalog data. Missing optional photos may use the site's neutral fallback;
  do not generate or select an image that could be mistaken for the actual
  product.
- Do not block technical release or publication of otherwise valid products
  solely because an optional image, promotional label, or nonessential display
  field is missing. Keep the limitation clear in Admin so the owner can replace
  it later.

This delegation does NOT authorize guessing physical stock or availability,
legal identity/RUC/address/contact details, product identity, bottle size or
concentration, or Import campaign contents/prices/availability. For those,
fail closed with draft/unavailable states. Do all independent release work and
report only the exact factual item that prevents a truthful transaction or
legal presentation. The user has authorized the normal Production release;
public indexing may be opened after the factual/legal prerequisites are
truthfully satisfied, without another confirmation request.

Never invent:
- stock quantity;
- supplier availability;
- legal identity;
- RUC;
- address;
- business contact data;
- product availability;
- product media;
- campaign availability;
- testimonials;
- bestseller claims;
- customer claims;
- Meta/WhatsApp credentials;
- approved templates.

If business truth outside the owner-delegation scope above is missing:

use safe states such as:
- draft;
- unconfirmed;
- unavailable;
- blocked;
- requires operator input.

Do not publish invented facts.

---

# 17. External blockers

Software implementation must not stop prematurely because of external facts.

First:

finish every internally solvable item.

Then produce ONE consolidated external-input list.

Separate:

TECHNICAL GAP
from
EXTERNAL FACT / CREDENTIAL REQUIRED

Examples of legitimate external blockers:

- Meta access token;
- Meta App Secret;
- WhatsApp phone number ID;
- approved WhatsApp templates;
- RUC;
- legal name;
- business address;
- confirmed inventory;
- confirmed supplier availability;
- missing real product media.

Never ask for a secret to be pasted into chat.

Give the owner an exact secure CLI/dashboard action instead.

---

# 21. Public release / SEO

Do not open indexing merely because the build is green.

SEO/public cutover requires truthful publication readiness.

Verify:

- robots;
- sitemap;
- canonical;
- metadata;
- OpenGraph;
- structured data where appropriate;
- factual product publication;
- legal/business truth;
- real media;
- real commercial readiness.

Indexing (2026-10-11): an explicit owner decision through the admin switch "Permitir indexación en buscadores"
(Operaciones; `public.admin_set_search_indexing`, AAL2 admin of every unit, audited, default OFF). It is independent from
content completeness: `public_launch_ready()` remains the factual readiness report and is shown next to the switch as a
warning. Agents never turn indexing on and never fake readiness data. `CRUZIAL_PRODUCTION_CUTOVER_APPROVED` is retired;
`CRUZIAL_INDEXING_FORCE_OFF=true` is an emergency override that closes everything.

Do not bypass DB-backed readiness checks for commercial availability (prices, offers, campaigns).
