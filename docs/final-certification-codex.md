# Cruzial V2 — independent final certification

> **Integration note (2026-10-11).** This branch was never pushed; it was preserved and merged into master through
> `claude/integrate-codex-certification`. Its three migrations had never been applied anywhere (Production and QA
> checked), so they were renamed to sort after the newest applied migration: `20260926152816` → `20261011120000`,
> `20260926153536` → `20261011120100`, `20260926153749` → `20261011120200`; pgTAP files `53_`/`54_` → `57_`/`58_`.
> The "required admin journeys silently skipped" finding had meanwhile been fixed on master (#51, #52), whose E2E
> versions were kept. Test counts below describe the 2026-09-26 run, not the integrated branch.

Date: 2026-09-26. Authoritative candidate: `fe5d5f9871d3a08fb815b24ecbd024328110db99`, [PR #13](https://github.com/Abel-Castill0/cruzialparfums/pull/13), `claude/final/cruzial-production-completion`.

**Verdict for that exact candidate: BLOCKED.** Seven confirmed P2 findings required corrections. The corrected implementation is on `codex/final/cruzial-certification-fixes`; its tested code HEAD is `02310bc24a7be35d6085238435fc4ee525d431aa`. P0: 0; P1: 0; remaining known P2 on the corrected implementation: 0 within the verified scope. The fixes still need reconciliation into the release candidate and CI on that reconciled SHA. Local corrected results do not certify the unchanged PR SHA.

No production mutation, deployment, merge, or change to master was performed. The original checkout stayed at the authoritative candidate with no tracked changes. Client PNG/PDF assets and unrelated files were preserved. The work used a separate managed checkout and a separate disposable Supabase stack. Its temporary project name, ports and dblink network alias were testing configuration, excluded from commits. The shared local stack was not reset or used for mutations.

## Authoritative release state

Read-only GitHub and production checks confirmed:

- Remote `master`: `0ba18017ecc8e075cfac3debf1eefdc6f81cd38c`.
- PR #13: OPEN, DRAFT, not merged, still at `fe5d5f9871d3a08fb815b24ecbd024328110db99`.
- Production: 70 migrations, latest `20260926020600`; `public_launch_ready() = false`; zero orders and zero complaints at the inspection times.
- The local `master` ref is older and was not used as production authority. Compatibility review used the exact remote master commit above.

## Findings and minimal fixes

All seven findings are P2. None was promoted to P0/P1 based on a hypothetical attack.

| Finding | Independent evidence and consequence | Correction |
| --- | --- | --- |
| CSV ambiguity and CR roundtrip | The campaign consumer accepted duplicate normalized headers and mismatched row widths. Its exporter left lone CR text unquoted, producing input rejected by the strict lexer. Five new regression cases failed before correction. | Reject ambiguous headers/row widths and quote CR. The common lexer remains the single grammar for campaign, catalog and media flows. An independent grammar oracle checked all 19,531 strings of length 0–6 over `a`, comma, quote, CR and LF. |
| Complaint concurrent replay outcome | Two deliberately interleaved submissions of the same attempt produced one receipt and one `23505` error. The repository's separate pre-read also allowed an incorrect `created=true` classification. There was no evidence of duplicate stored receipts. | Serialize by business unit and server-derived attempt. A new service-only v2 boundary returns receipt and creation outcome atomically. The original signature remains usable and participates in the same lock. Real concurrent v2 and legacy callers preserve original consumer data and emit one event per unit. |
| Old worker / new dispatch DB compatibility | The exact production-master worker checks only `begun.error` and ignores a returned cancelled status. Candidate migration `090000` returns cancellation successfully, allowing that old worker to call the provider during a DB-first cutover. | The legacy boundary raises `P2037` unless dispatch is authorized. A new service-only v2 boundary returns authoritative sending/cancelled state for the corrected worker. No applied migration was edited. |
| Complaint milestone starvation | The first 200 already-enqueued unresolved complaints repeatedly occupied the batch limit. Complaint 201 never progressed. Three backlog assertions failed before correction. | Exclude already-enqueued current milestone events before the limit, retaining complaint-first locks and the recheck. A 201-complaint regression and the existing enqueue/resolve race passed. |
| Actionable outcome focus | Complaint error/held states and Import error states did not reliably receive focus. An expired complaint failed the added focus assertion. A complete corrected browser run also exposed a mobile Parfums focus race before the panel committed. | Focus and scroll the mounted outcome panel in an effect. The transition focus correction removes the premature animation-frame focus. Desktop/mobile assertions require both focus and visibility below sticky headers. |
| Required admin journeys silently skipped | Exact-SHA remote Browser CI was 87 passed / 17 skipped. Thirteen required local admin/operations tests evaluated missing session files during collection, before setup created them. | Defer optional environment checks until execution; assert required local sessions and business fixtures. Cold-state final execution ran all 13 local admin/operations journeys plus three real password/TOTP setup journeys. Only four staging-only tests remain omitted. |
| Accepted order recovery depended on mutable cart data | Parfums checked current catalog/cart validity before recovering an accepted attempt; withdrawal or an empty cart could hide its receipt. Import cart loss or campaign reconciliation also blocked access to the accepted order. Recovery regression tests failed before correction. | Look up only the server-derived attempt with an explicit business-unit predicate, before validating a new order. Preserve persisted prices/deposit snapshots and `created=false`. Empty-cart recovery submits empty lines, which cannot create a fresh order. Lookup failure fails closed. Both units passed lost-response + cleared-storage recovery with exactly one order/event and one Parfums reservation. |

## Capability, PII and authorization evidence

The capability uses a 32-byte random nonce in an HttpOnly, flow-specific cookie. The SHA-256 derivation includes flow, business unit, nonce and issuance time; its UUID representation retains 122 variable bits. Request IDs, order numbers and complaint UUIDs do not reproduce the capability. Arbitrary valid-format nonces address the caller's own fresh attempts; altered nonce/time changes the derived ID. Timestamps more than five minutes ahead are rejected; the small permitted clock skew does not authorize an old identity. Replay authority expires after 24 hours. The cookie is retained for 31 days so expiry is recognized rather than automatically treated as a first visit.

Tests cover missing/malformed/expired/future tokens, client-supplied identity replacement, domain separation, changed-payload replay, different browser identities, cookie rejection, lost responses, reload, rotation failure with storage blocked, and explicit new attempts. A copied valid token in another browser is intentionally a bearer capability: possession authorizes that same attempt during its TTL. This is different from knowledge of a UUID/reference, which never supplies replay authority.

Current V2 public actions, service-client uses and RPC boundaries were searched across `apps/web`, `supabase` and relevant scripts. Public service-role mutation paths resolve the capability before receipt access. New order lookups use the derived identity and fixed unit predicate; a lookup error cannot fall through into creation. Worker/health routes authenticate before creating their service client. The webhook verifies its bounded payload, signature and permitted phone-number identity before service access.

Complaint consumer serialization uses an explicit allowlist. It excludes request identity, admin notes, resolver, operator status and worker/internal SLA metadata, including newly added unknown fields. It retains the consumer's receipt and due date. Anonymous receipt responses and WhatsApp messages use original persisted consumer/order snapshots.

Runtime catalog inspection of the corrected database found 153 `public`/`app` functions, no privileged function without a controlled empty `search_path`, RLS on every public table, and no anonymous INSERT grant. The only seven anonymous public function boundaries are public catalog/campaign/category reads, the public wholesale quote, launch readiness and coarse Parfums availability. Admin reads without a direct assertion were individually checked for `can_read_unit` or a guarded delegated function. Existing authorization requires an active unit membership and AAL2. pgTAP covers anon, authenticated non-admin, AAL1, AAL2 and both wrong-unit directions. The public admin wholesale view retains `security_invoker=true`.

## Verification matrix

PASS below is bounded by repository, local runtime and the described tests. It does not assert delivery of an external WhatsApp message or production smoke tests that would mutate data.

| Required capability | Original candidate | Corrected tested code | Evidence |
| --- | --- | --- | --- |
| ATTEMPT CAPABILITY | PASS | PASS | Token/action tests and browser handshake, rejection, expiry, rotation and recovery. |
| PII / REPLAY | PASS | PASS | Derived identities, unit-scoped reads, consumer DTO allowlist, direct RPC grants. |
| IDEMPOTENCY | FAIL | PASS | Concurrent complaint truth classification; accepted order recovery; one row/event/reservation. |
| SERVICE ROLE | PASS | PASS | Server-only clients, route authentication, public action capability boundary. |
| SECURITY DEFINER | PASS | PASS | Runtime paths/ACLs and guarded function-body inspection. |
| RLS / MFA / CROSS UNIT | PASS | PASS | Role matrix, real password/TOTP sessions, Parfums-only denial of Import. |
| INVENTORY / ORDERS | PASS | PASS | Independent old-base deadlock, canonical-lock fix, stock/release and optimistic concurrency pgTAP. |
| NOTIFICATIONS | FAIL | PASS | Legacy dispatch guard, 201-item backlog, deterministic resolution/claim/dispatch interleavings. |
| CSV | FAIL | PASS | Strict common grammar, exhaustive oracle, malformed/valid cases, formula and roundtrip tests. |
| AVAILABILITY | PASS | PASS | Public visibility filters, caller-built composite row forgery, raw inventory denial, final persistence authority. |
| COMPLAINTS | FAIL | PASS | Atomic receipt/outcome, unit separation, consumer copy/print interface and SLA/event tests. |
| PUBLIC FLOWS | FAIL | PASS | Catalog/cart/checkout/handoff, combos/wholesale/legal/404, Import campaign/deposit and recovery. |
| ADMIN FLOWS | FAIL (evidence gap) | PASS | All required local module and operations journeys now execute; database permission/write tests. |
| RESPONSIVE / A11Y / HYDRATION | FAIL | PASS | Mounted-panel focus, sticky-header visibility, axe, production bundle and seven viewport widths. |
| CI ISOLATION | FAIL | PASS locally | Cold setup, four-worker suite, both ordered mutating rerun sequences; remote reconciliation still required. |

## Notifications and inventory limits

Dispatch authorization is the irreversible boundary. Resolving a complaint before that authorization results in zero provider calls. Resolving after authorization, including while the provider call is in flight, cannot undo an external call. Tests preserve that distinction rather than claiming rollback of a message.

The worker tests cover cancellation, wrong/missing lease, authoritative payload replacement, timeout/uncertain outcomes, and provider success followed by failed DB completion. The last case reports failure and issues one provider call, without a second send in that processing attempt. Database tests independently cover expired sending -> uncertain, explicit verified-not-sent retry, two workers, cancellation after resolution and no blind uncertain resend. Provider behavior was tested with doubles; real outbound credentials were deliberately absent in the disposable runner.

The old 70-migration order implementation independently produced `deadlock detected` with reverse variant order. The candidate's canonical inventory lock ordering then passed the full DB gate: no oversell/double reservation and preserved presentation order, with cancellation/fulfillment paths covered. Persisted availability remains final authority after the page has loaded. Anonymous direct availability calls use real stored publication/unit/archive state rather than caller-supplied fields; non-public/unknown entities reveal no state and raw inventory remains private.

## Final gate evidence

Tested application code: `02310bc24a7be35d6085238435fc4ee525d431aa`.

- Production dependency audit: 0 vulnerabilities.
- Complete `npm run check`: catalog/commercial checks, 4j4b 6/6, lint with zero warnings, strict TypeScript, Vitest **1,025/1,025 in 86 files**, production build.
- Commercial artifacts remain byte-stable: 100 products, 324 variants, zero blockers/conflicts in the reconciliation output. No client commercial decision was invented or applied.
- Complete fresh local DB reset/test gate: **1,327/1,327 in 56 files**, 81 migrations. The private network alias was restored after reset for committed dblink tests; it resolved to the private database only.
- Complete production-bundle browser gate with four workers: **104 passed / 4 staging-only skipped**. Three session files were absent before collection; real password/TOTP setup and all 13 local admin/operations tests ran.
- Axe serious/critical violations: zero on the 13 required surfaces plus 404 in desktop/mobile. The suite rejects page errors and console errors on those surfaces, including hydration/React errors. Deliberately aborted response tests can produce expected server stream/connection messages.
- Responsive widths: 360, 390, 430, 768, 1024, 1280 and 1440. Actionable-panel focus and absence of sticky-header occlusion were checked in desktop/mobile.
- Same-stack mutating order reruns: desktop 10/10 -> mobile 10/10, then mobile 10/10 -> desktop 10/10, each with four workers. All 40 passed. No reset or reseed occurred between these reruns; phone-scoped persistence assertions and relative stock provisioning remained valid.
- Additional direct anonymous availability matrix: all eight checks passed for genuine published availability, draft/archived variants, draft/archived parent products, Import, unknown UUID and denied raw inventory access. Caller-built records included forged visibility fields. The synthetic transaction was rolled back.
- Committed dblink fixture inspection after the DB gate found zero matching orders, complaints, outbox rows or products for the concurrency test fixture prefixes.

The [exact original remote CI run](https://github.com/Abel-Castill0/cruzialparfums/actions/runs/36251136093) had Web 1,011 tests / 4j4b 6/6 / audit 0 and DB 1,308 tests in 54 files. Its Browser result was **87 passed / 17 skipped**, not the reported local 92/4. Green status did not prove the omitted admin journeys. The corrected branch has local evidence; no remote result is claimed for an unpushed/reconciled SHA.

## Migration safety and cutover order

**Safe for production: NO for the unchanged candidate as a standalone DB-first cutover; YES for the complete reconciled 11-migration batch under the controlled ordering below.** This is a technical assessment, not authorization to execute it.

All eight candidate migrations remain byte-identical. The only added migrations are append-only corrections. A private rehearsal started from the exact 70-migration base and applied all 11 pending files in one transaction, with a five-second lock timeout and 30-second statement timeout. It completed in 645 ms on the small disposable fixture database. Business table counts stayed unchanged. Existing function signatures, return types, ACLs and security/search-path configuration stayed unchanged. The separate CLI reset also successfully applied and recorded all 81 migrations. The rehearsal duration is not a production SLA.

| Order | Migration | Dependency, compatibility and locking |
| --- | --- | --- |
| 1 | `20260926030000_gate_b_fk_covering_indexes.sql` | Three ordinary covering indexes on reservation/status-event foreign keys. Blocks conflicting writes during build; not concurrent. No data rewrite. |
| 2 | `20260926040000_gate_b_status_only_availability_enforcement.sql` | Replaces reservation trigger logic; preserves signature/grants and existing order paths. |
| 3 | `20260926050000_gate_b_complaint_milestone_race.sql` | Complaint-first locking and recheck; worker signature preserved. |
| 4 | `20260926060000_gate_b_public_variant_availability.sql` | Adds anonymous computed availability. Its intermediate version must not become publicly visible before the visibility correction. |
| 5 | `20260926070000_gate_b_complaint_milestone_claim_boundary.sql` | Terminal complaint cancellation/uncertain claim behavior; existing worker signatures preserved. |
| 6 | `20260926080000_gate_b_variant_availability_visibility.sql` | Hardens the computed availability against hidden/wrong-unit/forged composite records. |
| 7 | `20260926090000_gate_b_notification_dispatch_authorization.sql` | Adds authorization timestamp/check and complaint-before-outbox locking. By itself is unsafe with the old worker's interpretation of cancellation. |
| 8 | `20260926100000_gate_b_order_inventory_lock_order.sql` | Canonical inventory pre-lock before inserting lines; existing service-only RPC signature/ACL retained. |
| 9 | `20260926152816_complaint_submission_atomic_result.sql` | Legacy complaint serialization plus new service-only atomic v2 outcome. |
| 10 | `20260926153536_notification_legacy_dispatch_guard.sql` | New authoritative dispatch v2; old caller gets an error for cancellation and cannot send. |
| 11 | `20260926153749_complaint_milestone_backlog_progress.sql` | Excludes current events before batch limit; preserves lock order/signature/ACL. |

Recommended cutover:

1. Reconcile all code/test/migration fixes onto a concrete release SHA and require its complete remote gate. Confirm production still has the expected 70-migration base; retain a recovery backup/snapshot.
2. Put public mutations and admin writes into maintenance; pause every worker/cron/wakeup source and drain existing provider calls. Web maintenance alone does not block direct Supabase API access.
3. Apply the complete pending batch in order. Use atomic visibility for the complete batch as rehearsed, with consistent migration-ledger recording, or temporarily disable the Data API until the entire ordered CLI batch is complete. This prevents the intermediate `060000` anonymous oracle and `090000` legacy-worker window. Supabase documents that disabling the Data API stops autogenerated REST endpoints regardless of grants/RLS: [official Data API security documentation](https://supabase.com/docs/guides/api/securing-your-api).
4. Deploy the reconciled application while maintenance/workers remain paused. The new application requires the new complaint/dispatch v2 functions. Do not serve it against the 70-migration DB.
5. Restore Data API access if it was paused, verify grants/RLS/AAL2/wrong-unit/public availability, persisted authority and operational health, then resume the reconciled workers and traffic. Launch/indexing flags are a separate authorized business decision; do not switch them incidentally.
6. On failure, keep maintenance in place and roll forward with an append-only correction or use the verified recovery procedure. An app-only rollback to old public replay boundaries is not a certified security rollback. No migration should be edited/deleted after application; no externally authorized send can be undone by a DB rollback.

The full batch preserves old RPC shapes and its legacy guard prevents old-worker cancellation sends. That structural compatibility does not authorize serving the old application's superseded public identity boundaries after cutover.

## Exact commits for reconciliation

Apply these commits in their existing order, or merge/reconcile the isolated branch without editing the applied migration history:

| Full SHA | Change |
| --- | --- |
| `4b593d1864bce211d3afe979b093fa5f9cda72de` | CSV width/header validation and CR escaping. |
| `93090c0a39b0e967ca68a6527a3b76abd04ba030` | Atomic concurrent complaint receipt/outcome. |
| `e093b5f5bea257d78f655b2b70ed0430abb202f8` | Legacy-safe notification dispatch boundary. |
| `c9cab908283a9b909fdcca8d451e96afaf37afb9` | Complaint milestone backlog progression. |
| `89278aac86ee5cfd6846afb2af9daa6894a88411` | Complaint/Import actionable error focus. |
| `594504e5e217a7b55dc38962ac55e1ccea596bf5` | Required local admin/fixture journeys. |
| `f264d8f39494095b5a622a5d3ea47988f10b04a7` | Parfums receipt recovery independent of cart/catalog state. |
| `54343a8a3c0c266172655ef5c5e87c2c675b20eb` | Additional dispatch-failure and visible-focus verification. |
| `8640ef6581ef1137e32e0cf511921596ee32aa6b` | Import receipt recovery after cart loss. |
| `02310bc24a7be35d6085238435fc4ee525d431aa` | Focus outcomes after transition commit. |

The certification document/evidence commit is separate from the tested implementation commits. Nothing was pushed, merged or deployed by this certification.

## Meaningful P3 and blockers

**Accepted P3: complete anonymous capability-cookie loss.** If every durable identity is removed, the server cannot distinguish the same anonymous person from a new visitor. Keeping a second cookie cannot survive complete cookie clearing; local/session storage is equally removable. Content/PII deduplication would wrongly merge legitimate repeat purchases, and accounts/indefinite identifiers would change the product contract. No safer architecture meeting the stated exclusions was found.

A fresh browser identity plus deliberate resubmission can create another pending request and, for tracked Parfums items, another bounded reservation. This is a real residual effect, not a guarantee of zero harm. The web does not automatically charge or fulfill; payment/delivery are coordinated externally, requests are rate-bounded, and stock reservations cannot oversell. Cookie rejection before persistence fails closed. Losing only cart/session storage while retaining the capability now permits truthful recovery in both order units. Complete identity loss remains P3 under this model; no PII fingerprint or weak deduplication was introduced.

External blockers, facts only: this audit did not send an external WhatsApp message, deploy, change DNS or test production writes. It therefore supplies no claim of live provider delivery or live cutover smoke completion. It found no additional external configuration blocker through the limited read-only evidence. Production launch readiness remains false. Missing client/legal/commercial decisions were not invented.

Final internal blockers: the authoritative PR SHA still lacks the seven confirmed corrections; reconciliation and complete remote CI on the resulting SHA are outstanding. The tested isolated implementation has zero remaining known P0/P1/P2 in the audited scope.

**FINAL VERDICT: BLOCKED for `fe5d5f9871d3a08fb815b24ecbd024328110db99`.** The corrected implementation is ready to be reconciled and re-gated as the consolidated release candidate. Explicit cutover authorization is still required before any production action.
