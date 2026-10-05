# Milestone 3 security review (NFR-SEC-04, NFR-SEC-06)

| | |
|---|---|
| Date | 05.10.2026 (Slice 15) |
| Scope | Everything Milestone 3 changed in `backend/src` and `frontend/src`, Slices 1–14: 261 files and about 16.5k added lines, tests excluded (`git diff cfeaa4e^..HEAD`). |
| Method | The M1 and M2 process: candidate vulnerabilities traced from the request to the data, and only findings at ≥ 8/10 confidence kept. The focus was the five M3 questions in §2, each checked by running the code rather than by reading it. The built-in `/security-review` pass over the whole milestone diff has **not** been run; see §5. |

## 1. Findings

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | **A signed contract could be fetched as a public file by percent-encoding its name.** `/uploads` is public and carries images. Signed contracts are stored there too (`contract-<uuid>.pdf`) and the app blocked that name with a pattern, but tested it against the *undecoded* path while `express.static` decodes it. `GET /uploads/<tenant>/%63ontract-<uuid>.pdf` returned **200 with the PDF**, with no sign-in. The file name is a random UUID, so it could not be guessed, but anyone who ever held the URL (it is in `documentUrl`, which every role with `commercial.view` receives, and which can be forwarded or logged) could read the contract for good, bypassing the scope check and the revocation of the role. | Medium | **Fixed.** The block now decodes the path first, and answers 404 for a malformed escape. `contractFilesNotPublic.test.ts` requests the file plain, with an encoded first letter, dot and dash, in upper case, with a doubled slash and with a dot segment (all 404), and checks that an ordinary uploaded file is still served. |
| 2 | **`FR-PAY-09` was listed twice in `scripts/srs-requirements.json`** (Slices 1 and 9 each added it). The traceability check does not mind, but a list that counts a requirement twice is a list nobody can trust (NFR-MNT-03). | Low (hygiene) | **Fixed.** One entry remains, and a test fails on a duplicate. |

No other finding survived verification.

## 2. What was checked

1. **Permission matrix and route coverage (NFR-SEC-01).** `permissionMatrix.test.ts` (1,338 checks) and `routeCoverage.test.ts` pass with every M3 route: contracts, documents, instalments, payments overview and export, renewals, performance and the four dashboards. No M3 route is in the exemption list. The only exemptions are the M1 ones plus `GET /dashboard/home`, which returns only the dashboard kind of the caller (FR-DSH-01) and is written down in the test. None is stale.
2. **Document access (FR-CON-19, NFR-SEC-06).**
   - No public URL: see finding 1. Documents are read through `GET /contracts/:id/documents/:documentId/download`, which needs `commercial.view` and the contract's scope, and answers `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`.
   - Only a real PDF is stored: the first bytes are checked for `%PDF-`, not the declared type, and the upload limit is 15 MB (`contractLifecycle.test.ts`, "only a real PDF under 15 MB is accepted"). The stored name is random, the original name is reduced to `[\w.\- ]` and quotes are removed from the header.
   - Reception gets 403 on the list and the download.
3. **Redaction against every new response (FR-RBAC-21, FR-DSH-08).** `m3ResponseRedaction.test.ts` reads every M3 response (contract list and detail, instalments, instalment history, Payments overview, Renewals, Performance, the CEO and Sales Manager dashboards) as three roles and walks the JSON for any guarded field name, including the `key` of each dashboard figure:
   - **Reception** (neither permission): no `COMMERCIAL_FIELDS`, no `PAYMENT_FIELDS`, and no `documentUrl`, `documentName`, `dealId` or `renewalDate`.
   - **`payments.view` without `commercial.view`**: sees the status of an instalment, no amount, price, document or deal.
   - **`commercial.view` without `payments.view`**: sees the price, no payment field.
   `total` is exempt only when it is a number (a row count); money is always a string. The existing `executiveDashboards.test.ts`, `renewalReminders.test.ts` and `paymentsOverdue.test.ts` still cover the dashboards and the overview for the CEO role copied without `payments.view`.
4. **Scope bypass by request parameter (FR-RBAC-23).** Performance and the dashboards take the viewer's scope from the access context, never from a parameter. A Sales User asking for another salesperson, or for a salesperson outside the Manager's team, gets 403 whatever else the request says (`performance.test.ts`, `dashboards.test.ts`, `executiveDashboards.test.ts`: "a foreign request is a 403"). The Administrator and Reception have no performance access by default.
5. **Money and raw SQL.** No `$queryRaw`, `$executeRaw` or `$queryRawUnsafe` was added in M3, and the frontend has no `dangerouslySetInnerHTML`. Contract and payment money is `Decimal(12,2)`, sent as a string and never added up in JavaScript (the dashboards sum in the database).
6. **Audit (FR-AUD-11, 12, 13).** Contract settings, creation, every status change, document attach and replace, instalment actions, the renewal link and Not renewing each write an audit entry in the same transaction; each entity type is in `AUDITED_ENTITY_TYPES`. The payments and performance CSV exports are audited with who, when and the filters, and the CSV writer neutralises a cell that starts with `=`, `+`, `-` or `@`.
7. **Daily jobs (NFR-REL-01).** Expiry, renewal reminders and overdue each have the three tests of plan rule 5 (twice in a row, after a gap, a failing notification), and a failing workspace does not stop the others (`dailyJob.test.ts`, `paymentsOverdue.test.ts`). On staging the jobs are run for a chosen day with `npm run jobs:run -- --now <ISO> --only <job>`, which uses the same code and writes the same entries as the scheduler.

## 3. Known risks

| Risk | Decision |
|---|---|
| **Field redaction checks whether `commercial.view` or `payments.view` is held, not its scope** (accepted in M1 and M2). Contract and payment values make it matter more. The document download has the same shape: it needs `commercial.view` and then resolves the *record* scope from `contracts.validity.view`. | **Accepted again, with the reason checked.** The default roles give the permissions a record is reached by and the permissions that reveal its fields the same scope: Sales User `Own` for `contracts.validity.view`, `contracts.manage`, `commercial.view`, `payments.view`, `performance.view` and `deals.view`; Sales Manager `Team` for the same; CEO and Administrator `All` (`DefaultRoleMatrix.ts`). The gap exists only for a *custom* role given a wider record scope than its `commercial.view` or `payments.view` scope, for example `contracts.validity.view` All with `commercial.view` Own: it then sees amounts on every contract it can reach. No default role is affected. Anyone creating such a role should keep the scopes equal. **Fix it** (check the scope per record in `redactFields`, and in the document download) **if Wellness Albania asks for roles like this**, for example a Finance role that reads all payments but only its own deals. |
| **A copied contract document URL is stored in `documentUrl`** and shown to roles with `commercial.view`. | Harmless now that `/uploads` refuses contract files (finding 1): the URL opens nothing. The frontend links to the download endpoint. Dropping `documentUrl` from the response is a cleanup for a later milestone. |
| **`/uploads` still serves images publicly** (accepted in M1). | Unchanged; no M3 file other than signed contracts is stored there. |
| The M1 and M2 accepted risks (CSRF token, token revocation, `users.manage`, public quotation link prices, `CancelInvitation`). | Unchanged: none involves a Milestone 3 route. |
| **The CORS allowlist still names the Neva CRM origins.** | **Remove them before go-live** (UAT pre-flight P8). |
| **Direct database seeding for UAT data** (`seed:uat`, now including M3 contracts, instalments and the bulk volumes). | Operator-run only, on staging. It writes what the API refuses by design (an instalment due yesterday, a contract ending in 25 days, a company with history). It is not reachable from the app. `npm run jobs:run` writes for every workspace: staging only. |

## 4. Automated checks in CI

- `routeCoverage.test.ts`, `permissionMatrix.test.ts`: every tenant route declares a permission or is a reviewed exemption, and each gated route is checked for each of the five roles.
- `contractFilesNotPublic.test.ts` (new): a signed contract is never a public file, however its name is spelled.
- `m3ResponseRedaction.test.ts` (new): no guarded field in any M3 response for Reception, for `payments.view` without `commercial.view`, and for the reverse.
- `uat6ReceptionNoSalesData.test.ts`, `renewalReminders.test.ts`, `contractLifecycle.test.ts`, `executiveDashboards.test.ts`: Reception, scope and document checks of the earlier slices, unchanged.
- `milestone3Hardening.test.ts` (new): the sq and en catalogues match, every notification type has a sentence in both, `check:translations` passes, every ID the plan gives a slice is in `scripts/srs-requirements.json` once, and the traceability check passes.

## 5. Not done here

- The built-in `/security-review` pass over the milestone diff was not run in this slice; the review above is targeted at the five questions the plan names. Run `/security-review` on the release branch before sign-off and add anything it finds to §1.
- Nothing here was exercised on the staging server itself (HTTPS, headers, CORS): that is the pre-flight in `deploy/uat-milestone-3.md` §2.
