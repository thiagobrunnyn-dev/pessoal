# MBL Facilities — private uniform pilot

Source export of published v7, based on commit `ac70942c4484b47a776886c6d79390e987000b15`. This copy replaces deployment-specific settings and sample names for local review.

## Local build and tests

From the repository root, enter `apps/uniformes` and run the following commands with Node.js 24.15 or later in the Node.js 24 series:

```sh
cd apps/uniformes
npm ci
npm run build
node --test tests/*.test.mjs
```

The build generates the browser vendor bundle, embedded assets and Worker output. Tests use synthetic subjects, local SQLite and a simulated DOM.

The generic `.openai/hosting.json` carries no Site ID or production bindings. For a separately configured runtime, inject `OWNER_SUBJECT` server-side using the verified authenticated subject for that environment, and provide an independent D1-compatible binding named `DB`. The Worker rejects access until a valid owner subject is configured. The `.env.example` file documents the variable and is not loaded by the Worker. Use only an authentication gateway that strips client-supplied identity headers and sets trusted values itself.

## Runtime
- Cloudflare-compatible ESM Worker in `src/worker.js`, bundled to `dist/server/index.js`.
- Managed D1 binding `DB`, generated Drizzle schema/migration in `db/` and `drizzle/`.
- Every API and asset requires identity headers set by the trusted authentication gateway. The original Sites publication is owner-only.
- The trusted Site user ID is the server-only namespace. `live` and `demo` are separate namespaces. Client-supplied tenant IDs are rejected. This version does not grant any staff/customer access or implement cross-account shared operator memberships.
- Actual records start empty. Fictional seed data is optional and only available in the isolated demo mode. Nothing is imported from photos.

## Operations
Companies, destinations, employees, permanent physical-piece IDs, collection rols, counted intake, washing, separation, individual outbound checks and dispatch. Dispatch is not proof of delivery. The daily intake report counts actual receipt timestamps, grouped by company and employee, using America/Belem (UTC−3).

Writes use a version-checked atomic D1 batch and append-only audit. Idempotency keys protect safe retry after uncertain acknowledgements. A version conflict asks the operator to refresh and retry rather than overwrite another device. No mutation is confirmed while offline. Reads are snapshot batches. Data is shared for the same authorized login across devices and refreshed through the visible update button or when returning to the page.

QR contains only an opaque permanent ID, no employee name/number/room. The on-device decoder uses bundled, pinned `jsqr`; camera frames are not uploaded. Camera activates only after an explicit button and browser permission. Manual code entry works without a camera. The PNG is a QR test asset, not a validated industrial-label layout.

## Backups and limits
CSV for operational reports; full JSON export includes records, version and audit. Export data restoration has been locally checked in a separate SQLite database. A production restore procedure and the platform-managed recovery/retention guarantees still need confirmation before the pilot is relied upon as the sole operational record. No automatic external backup, storage destination or schedule has been configured.

This pilot supports up to 10,000 records per entity group. It has no destructive record deletion UI, customer portal, offline writes or legacy-system integration.

## Verification
- `node tests/api.test.mjs`: SQLite-backed authentication, tenant/mode isolation, idempotency, CAS concurrency, business-rule validation, reopen persistence and export round-trip.
- `node tests/ui.test.mjs`: DOM-based end-to-end form workflow and WebMCP contract, without physical browser rendering.
- Generated QR PNG was decoded back to the exact ID with the same software decoder.
- Independent read-only security review completed; fixed stale client response/pending retry mode issues.
- Actual platform access, hosted persistence and mobile camera/industrial-label trials must be separately reported; local tests are not evidence of physical hardware or browser layout validation.

## Brand
The export includes the MBL Facilities logo and the DM Sans and Manrope fonts with their license files.

## Return deadline
New rols require an explicit triage-start date; it is never defaulted from collection or entry. The server starts the clock at 09:00 in America/Belem and counts 48 hours with whole Sundays excluded. Earlier delivery is allowed. Collection dates and optional collection times are separately validated; Sundays are closed and triage cannot precede collection. Friday returns Monday at 09:00; Saturday returns Tuesday at 09:00. No holiday or late-arrival adjustment is inferred.

Deadline fields are additive within the existing JSON records; no schema migration or backfill is needed. Existing rols without confirmed triage dates retain their prior deadline unchanged and are visibly marked "Triagem a confirmar". This release does not provide historical deadline editing. CSV preserves the old due-date column and adds triage/collection time, authoritative due timestamp, timezone and confirmation status.

`node tests/deadline.test.mjs` covers calendar boundaries, independent host timezones, malformed dates, Sunday rejection and historical preservation. No rol-specific printing workflow exists; this change only updates the existing digital rol and exports.

## Driver trip module (access not yet activated)
The `/viagens` office screen prepares inbound collection and outbound return legs, with explicit city, origin, destination, vehicle base, optional rol IDs and an optional already-approved driver. The Canaã vehicle is based in Canaã; the Curianópolis vehicle is based at the laundry. Unassigned planned trips can be assigned once to an existing enabled membership. This is trip assignment, not account enrolment. Trips do not modify uniform/rol dispatch or confirm customer delivery.

`/motorista` is a separate small mobile surface. Assigned drivers can record “Saindo para a lavanderia”, then “Cheguei à lavanderia” on the same inbound trip. Outbound trips offer “Saída da lavanderia para devolução” only. Owner visits show a disabled preview, not a working impersonation. UTC server acceptance timestamps are displayed in America/Belem; the inbound duration is their difference. These are button-registration times, not GPS evidence. Offline attempts never claim success; uncertain writes retain an idempotent retry payload. Refresh and returning to the page read the latest records; no background GPS or continuous tracking exists.

The runtime owner subject is configured server-side and is also the tenant namespace. No browser input, email match, first visitor, or platform account-user ID is used to claim ownership. Existing uniform data remain in the same tenant and live/demo namespaces. Unknown subjects are denied; driver subjects have only dedicated trip APIs and the minimal driver asset allowlist. All office APIs, exports and assets are forbidden to drivers. Driver JSON omits employee details, rols, database tenant and authentication subjects.

Migration 0001 creates three empty, additive transport tables; it does not seed memberships or change prior tables/data. No enrolment API or automated email-to-subject binding is present. Before activation, the owner must identify each driver and approve the intended access and any platform invitation email, with required access confirmation. The driver's verified Site-specific authenticated subject must be established through the authorized platform flow and explicitly mapped; it must never be guessed from email or accepted from a self-asserted form. The actual Site stays owner-only until those approvals and verification occur. Public or shared-bearer-link access is not part of this implementation.

## Audited corrections

The existing owner can correct saved companies, destinations, employees, permanent-piece registries, collection rols and trips. Every correction needs a 5–500 character reason. The append-only `record_corrections` journal stores complete before/after values, server actor and time, request ID and version. History is available beside each source record and included in the complete JSON backup; daily reports and route views link to their source rol. No production data, memberships or permissions are seeded or changed by this feature.

Corrections never regenerate IDs/QR codes, erase events, create/cancel/reopen movements, or bypass current authorization. Rol snapshots remain independent of later registry edits; their displayed historical fields can be explicitly corrected. Historical piece types are frozen before a later registry correction and the affected rows are included in that correction audit. An active rol blocks changing a received piece's owner/type. Counts must cover received pieces and remain exact after shipment. Collection, triage and previously recorded travel timestamps are checked chronologically. Trip driver and direction cannot change after departure; only already-present timestamps can be corrected. Linked rol cities and trips must stay consistent.

Uniform records use workspace version checks; trip corrections and driver buttons use trip revisions. Stale forms fail instead of overwriting. Retries retain the original request; changed payloads cannot reuse a correction key. Original creation and assignment commands are retained for safe replay after later corrections. Drivers remain restricted to their own trips and cannot use the administrative edit/history APIs.

Validation: `node --test tests/*.test.mjs` runs SQLite-backed isolated API/security/concurrency tests plus JSDOM edit/retry/history tests. `npm run build` builds the Worker. Tests do not access production storage. Authenticated browser/physical-device acceptance remains a separate check.
