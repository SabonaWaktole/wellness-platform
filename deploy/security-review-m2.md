# Milestone 2 security review (NFR-SEC-04, NFR-SEC-05)

| | |
|---|---|
| Date | 04.10.2026 (Slice 14) |
| Scope | Everything Milestone 2 changed in `backend/src` and `frontend/src`, Slices 1–13: about 508 files and 33k added lines, tests excluded. |
| Method | The M1 process: candidate vulnerabilities traced from request to data, and only findings at ≥ 8/10 confidence kept. The focus was the five M2 questions in §2. The automated checks in §4 run in CI on every push. |

## 1. Findings

No exploitable finding survived verification. One test gap was closed:

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | **"Reception sees no sales data" (UAT-6) was covered one route at a time**, so a new M2 route could be added without anyone asking what Reception gets from it. | Low (test gap) | **Closed.** `uat6ReceptionNoSalesData.test.ts` makes a won deal with a sent offer and a follow-up, then checks that Reception is refused every M2 route family (deals, board, offers and PDF, follow-ups, pricing, script, approvals, calendar) and that the company history Reception can open has no deal event and no price. |

## 2. What was checked

1. **Permission matrix and route coverage.** `routeCoverage.test.ts` and `permissionMatrix.test.ts` pass with every M2 route (deals, offers, pricing, discount approvals, follow-ups, calendar, sales script). No M2 route is in the exemption list: each declares a permission. The only exemptions are the M1 ones in §4 of the M1 review, and none is stale.
2. **D6, the sales-process switch.** In a workspace on the sales process (the Wellness Albania default), the public quotation link returns 404 for the page, the PDF and accept (`offerDocuments.test.ts`, FR-OFR-07), and no email is sent (FR-RBAC-18).
3. **Redaction against every new response (FR-RBAC-17).** Every money or percentage field name used in the M2 view and use-case code was compared with `COMMERCIAL_FIELDS`. All response fields are listed, including the late additions (`listPriceAtRequest`, the manual price fields, `totalNetMonthlyPrice`, `offerNetMonthlyPrice`, `offerAnnualValue`, `agreedMonthlyPrice`, `agreedAnnualValue`). The names left over (`netAnnualValue`, `monthlyPrice`, `manualPrice`) are internal domain values that reach the response only under a listed name (`annualValue`, `manualMonthlyPrice`); `GET /offers` and the pricing routes also need `commercial.view` or `offers.edit` before the redaction runs. The `DEAL_WON` timeline event drops its agreed values without `commercial.view`, and without `deals.view` the whole DEAL category is hidden.
4. **Rich text and exports (NFR-SEC-05).** The script and the offer texts go through `sanitizeRichText` on save and on publish (tests in `salesScript.test.ts` and `servicesAndOfferSettings.test.ts`). The offer PDF is drawn with pdfkit from stored text, not from HTML. Deal titles, lost-reason notes and activity text are shown as plain text by React. The audit CSV keeps its formula guard.
5. **Record scope and IDOR.** Deals, offers, follow-ups and the calendar load by tenant and apply the viewer's scope, returning 404 outside it (`deals.test.ts`, `followUps.test.ts`, `calendar.test.ts`, `discountApprovals.test.ts`). The won, lost and reopen steps use the same deal loading, and the agreed price cannot be passed in: it is copied from the offer on the server (FR-DEAL-14).
6. **Raw SQL.** No `$queryRawUnsafe` was added. The board and calendar use Prisma's query API.
7. **Audit.** Win, lose, reopen, offer status, discount decisions, pricing and script changes each write an audit entry (FR-AUD-09), and each M2 entity type is in the registry (FR-AUD-10, `auditRegistry` test).

## 3. Known risks

| Risk | Decision |
|---|---|
| **Field redaction checks whether `commercial.view` is held, not its scope** (accepted in M1). It matters more now that deal values exist. | **Accepted again, with the reason checked.** Deals, offers, follow-ups and the calendar are scoped by `deals.view`, `offers.edit` and `calendar.view` before any field is read, and the default roles pair them with the same scope as `commercial.view` (Sales User: own; Sales Manager: team; CEO and Administrator: all). The gap exists only for a custom role given a *wider* record scope than its `commercial.view` scope, for example `deals.view` all with `commercial.view` own: it then sees amounts on every deal it can reach. No default role is affected. Anyone creating such a role should keep the two scopes equal. Fix it (check the scope per record in `redactFields`) if Wellness Albania asks for roles like this. |
| The M1 accepted risks (CSRF token, token revocation, `/uploads`, `users.manage`, public quotation link prices, `CancelInvitation`). | Unchanged: none involves a Milestone 2 route. The public quotation link is off in the sales process (D6). |
| **The CORS allowlist still names the Neva CRM origins.** | **Remove them before go-live** (UAT pre-flight P8). |
| **Direct database seeding for bulk and planned UAT data** (`seed:uat`). | Operator-run only, on staging. It writes follow-ups in the past, which the API refuses by design. It is not reachable from the app. |

## 4. Automated checks in CI

- `routeCoverage.test.ts`: every tenant route declares a permission or is a reviewed exemption.
- `permissionMatrix.test.ts`: generated from the live router, each gated route checked for each of the five roles.
- `uat6ReceptionNoSalesData.test.ts`, `offerDocuments.test.ts` (D6 and the redaction of the offer), `deals.test.ts`, `draftOffers.test.ts` and `pricingConfiguration.test.ts`, all of which fail on any field of `COMMERCIAL_FIELDS` in a Reception response through `expectNoCommercialFields`.
