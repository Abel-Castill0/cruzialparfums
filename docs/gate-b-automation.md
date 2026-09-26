# Gate B operations automation runbook

## Deployment boundary

Gate B is reviewed on its feature branch. Hosted migrations, production code,
credentials, campaign opening and indexing require the later authorized rollout.
No credentials belong in this document, Git, client bundles or screenshots.

## Notification contract

Order and complaint events insert a notification in the same database transaction.
An unsuccessful business transaction leaves no notification. The unique event key
prevents another queue entry when the event is replayed. Payloads contain the
persisted reference; complaint detail, identity documents and legal response text
are excluded.

Jobs progress through `queued` → `claimed` → `sending` → `sent`. Provider absence
is `blocked` with `provider_not_configured`. A known rate-limit rejection uses a
bounded exponential retry (30 seconds to one hour, at most five sends). Known
permanent rejection is `failed`.

The Cloud API adapter does **not** assume an undocumented provider idempotency
header. A timeout, an ambiguous provider failure or an expired `sending` lease is
`uncertain`. It is never automatically resent. An expired `claimed` lease can be
retried because the send intent was not recorded. Inspect the real provider
delivery history before an administrator confirms “verified not sent” and retries
an uncertain job. This avoids duplicates at the cost of human reconciliation for
the small set of ambiguous outcomes.

`sent` means provider acceptance, not proof the consumer read the message. Signed
webhook events separately record `delivered`, `read` or `failed`. Early and repeated
webhook events are retained as minimal status proof and reconciled idempotently.

## WhatsApp configuration

Supply server environment values from the real Meta account:

- Graph API version supported by the app.
- System-user/access token with the required WhatsApp permissions.
- Each unit's phone number ID.
- App secret and a separate webhook verification token.
- Each event's approved template name and language in that unit's templates JSON.

The supported event keys are `order_received`, `order_confirmed`,
`order_cancelled`, `order_fulfilled`, `complaint_received`,
`complaint_approaching`, `complaint_overdue` and `complaint_resolved`.
Templates use one body parameter: the reference. Approval and parameter meaning
must match the actual Meta template. Configuration presence is not a successful
live provider test. No provider message is sent by CI.

The existing Peru mobile normalization is used for delivery. A phone outside that
verified contract is blocked for review instead of guessing a country code.
Existing customer identity normalization is preserved. Email remains explicitly
unconfigured until a real business email sender is selected and configured.
Manual `wa.me` links remain available.

Webhook callback: `/api/webhooks/whatsapp`. GET verifies `hub.verify_token` and
returns the plaintext `hub.challenge`. POST checks the HMAC SHA-256 signature over
the exact raw bytes using the app secret, bounds input size, and accepts status
events only for configured phone number IDs. It does not save incoming message
bodies, contacts, provider error bodies or raw webhook envelopes.

Contract references: [Meta webhook SDK documentation](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/)
and the [Meta Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).

## Worker and scheduler

Successful app business mutations schedule an immediate worker after persistence.
The queue remains durable if this request is interrupted. The scheduled catch-up
route is `/api/automation/process`, authorized by a dedicated `CRON_SECRET` of at
least 32 characters. Missing or incorrect authorization cannot process jobs.
Set this secret using the deployment environment manager; never paste it into a
URL or command saved in history.

The default Vercel schedule is once daily at 13:00 UTC (08:00 Lima), compatible
with Hobby scheduling. It processes at most five jobs per invocation, uses
`FOR UPDATE SKIP LOCKED`, random leases and an eight-second provider timeout.
Immediate requests handle normal volume; monitor backlog and worker heartbeat.
Daily catch-up alone is not an immediate-delivery guarantee. For a sustained
backlog, an operator can increase frequency only after verifying the real plan,
or securely invoke the same route from existing approved scheduling infrastructure.
No additional paid vendor is required.

Vercel runs Cron only for production deployments. Preview verification must invoke
the protected route from a trusted server/operator environment or use local tests.
See [current Vercel Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
and [scheduler configuration](https://vercel.com/docs/cron-jobs/quickstart).

## Incident handling

1. Inspect the unit's operations page and latest worker completion.
2. If provider configuration is missing, supply the real configuration and approved
   templates, then retry blocked jobs explicitly.
3. If a job failed, use the safe error category and real provider console to correct
   configuration or recipient facts before retrying.
4. If a job is uncertain, verify non-delivery before enabling a new send.
5. If the heartbeat is stale, verify scheduler authorization and deployment logs.
   Keep credentials, customer details and provider bodies out of support logs.
6. Manual fallback remains usable while automation is unavailable.

Complaint notifications communicate reference/status only. A human remains
responsible for approving and delivering the legally sufficient written response.
## Complaint deadlines and human resolution

Indecopi's current rule requires responding to both complaints and grievances within **15 non-extendable business days**. Sources: [Indecopi consumer portal](https://consumidor.gob.pe/libro-de-reclamaciones/) and [official regulatory announcement](https://www.gob.pe/institucion/indecopi/noticias/641594-modifican-reglamento-del-libro-de-reclamaciones-para-que-proveedores-atiendan-reclamos-y-quejas-de-clientes-en-15-dias-habiles).

PostgreSQL calculates the deadline from the original submission timestamp, starting the following date, using Lima time, Monday–Friday, and Peru national holidays including Holy Thursday/Good Friday. The deadline is the end of the fifteenth business day. The calendar was verified against [Peru's official holiday calendar](https://www.gob.pe/feriados) for 2026. Public-sector optional non-working dates are not automatically imposed on a private business. Rule identifier: `peru-15-business-days-2026`; review the calendar when law or private business obligations change. This documented calendar is the operational interpretation of business days, and does not replace legal review.

Admins can configure their own unit's internal reminder recipient and lead time (1–7 business days). Blank recipient or missing provider produces an honest blocked job. Configuring a recipient recovers previously blocked internal alerts. Milestone jobs are unique; resolving a complaint cancels unsent reminder jobs. An already sending or uncertain job retains its evidence for reconciliation. Legal response substance remains in the human-approved admin workflow and is never included in automated templates.
## Import batch workflow

Live read before implementation: campaign 6 remains draft, with 898 offers, all unconfirmed; all 844 Import products lack active media. No hosted writes were performed.

`/admin/import/lotes` extends the existing campaign CSV workflow. Catalog rows use exact UUID + timestamp identity and explicit product/presentation kinds. A blank category preserves the current mapping. The dry run validates live unit ownership, category IDs, versions and field types; the final RPC rechecks and applies all rows atomically through existing audited canonical mutations. Invalid rows block the catalog batch; an error report can be downloaded. Prices and availability remain in `/admin/import/consolidados/[id]`, whose existing CSV preview and explicit selection feed the canonical atomic campaign save.

Media batches match exact filename stem to slug or an explicit `filename,product_id` manifest. Ambiguous/unmatched/duplicate identities are excluded and reported. The operator explicitly uploads the matched subset. Each image uses the existing server-issued product authorization, Cloudinary upload and authorized registration boundary. Results are per item because external uploads cannot share a PostgreSQL transaction. No external asset deletion is performed. A failed registration may leave an orphan requiring authorized reconciliation; retry only failed files to avoid replacing successful images unnecessarily.

Publication preview uses the selected campaign's exact identities and current versions. Eligible means active product/presentation, non-ambiguous presentation, positive campaign price, confirmed availability and active primary media. An explicit selection is locked and rechecked in the transaction. The campaign version is advanced, its status is preserved, and item/summary audits are written. Publishing never confirms availability or opens the campaign.
## Operations, launch readiness and monitoring

Both units have `/admin/<unit>/operaciones`, protected by the existing AAL2 membership boundary. Counts are calculated from real orders, complaints, reservations and queue states. Pending confirmations older than 24 hours are explicitly labeled with that operational threshold. Tracked inventory with zero free units is shown as exhausted; no arbitrary low-stock threshold is invented. Stock displays physical, reserved and free quantities for admins. Failed reservation attempts roll back with the order and are not counted as a fabricated persistent conflict metric.

Order detail displays reservation lifecycle, status timestamps/actors and safe notification delivery state. Import customer detail retains notes, status, paginated history and last order, and adds pending count and fulfilled-order value grouped by currency. These are order values, not proof of payment. Existing Import phone resolution and its concurrency-safe unique index remain intact. Parfums was evaluated: its accepted phone contract and customer rules do not establish Import's verified returning-customer/deposit meaning, so automatic cross-unit or verified-status inference is not introduced. Parfums orders retain their own immutable customer snapshot.

Business contact, legal identity, exchange and payment notes remain editable in each unit's existing Configuración page. Campaign dates/status remain in Consolidados. New private internal reminder settings use an authorized, versioned, audited RPC.

`app.unit_launch_readiness` is the single factual calculation used by operations and the public aggregate launch boolean. It requires complete legal/contact fields, primary media, publication and commercial facts; Import also needs structurally clear published presentations, confirmed positive offers and a currently open campaign. It returns reasons and counts to authorized admins; the public RPC exposes only one boolean. Root metadata, robots and sitemap require production environment, explicit cutover approval **and** the authoritative boolean. Missing DB/config/schema fails closed. `CRUZIAL_PRODUCTION_CUTOVER_APPROVED=false` is preserved; the software never grants operator approval itself.

### Monitor and incident procedure

Protected `GET /api/automation/health` uses the same server-only bearer secret as the scheduler. It returns app alive, DB reachability, schema compatibility, provider configuration and worker heartbeat, without secrets, contacts, database errors or raw version numbers. Unauthorized requests are rejected before opening a privileged client. The daily processor records its own heartbeat; no external paid monitor is required. Never place the bearer secret in a query string or client code.

- **Never run / stale**: verify production cron deployment, secret and route invocation. A daily catch-up is considered stale after 26 hours (allowing Hobby timing variation); running longer than 5 minutes requires investigation. Check protected health and the unit operations screen.
- **Provider absent / blocked**: configure server credentials and owner-approved event templates, verify webhook subscription, then explicitly retry eligible jobs. Configuration presence is not an actual delivery test.
- **Uncertain delivery**: reconcile with Meta before selecting “Comprobé … no fue enviado.” Never retry solely because the HTTP response was lost.
- **Delivery failure after acceptance**: inspect provider proof and contact correctness. Preserve original message proof; do not automatically issue a second message.
- **Backlog**: immediate action wakes and daily catch-up process batches of 5. An operator can invoke the protected processor again; higher sustained volume needs an explicitly selected supported schedule. Do not assume a paid plan.
- **Overdue complaint**: review case in the correct unit and approve the legal response through the human workflow. The automation manages reminder/reference proof, not final response substance.
- **Schema unavailable**: apply the reviewed append-only migrations through the authorized release procedure before application cutover. This Gate does not perform that hosted procedure.

## Verification fixtures

The existing local browser runner now loads separate synthetic Gate B fixtures. It refuses non-loopback Supabase, mints random test accounts/TOTP factors, uses a separate Gate B AAL2 session, clears WhatsApp send credentials and forces cutover false. It never sends provider messages. Fixtures are for disposable local databases only. Browser coverage exercises both order workflows, tracked consumption, complaint resolution, catalog dry-run/apply, explicit publication, exact media preview, retry UI and responsive accessibility.
