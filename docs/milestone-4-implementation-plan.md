# Wellness Albania Platform — Milestone 4 Implementation Plan (slice-based)

| Item | Value |
|---|---|
| Source | `Wellness Platform - Milestone 4 SRS.docx` v0.1 (06.10.2026), `milestone-1-implementation-plan.md`, `milestone-2-implementation-plan.md`, `milestone-3-implementation-plan.md` |
| Scope | Milestone 4: Wellness+ Members (starts Phase 2, completes the platform) |
| Builds on | Milestone 3, as implemented on branch `m3-slice-15-hardening-uat-readiness` |
| Approach | Vertical slices. Each slice is one branch (`m4-slice-N-<name>`) and one PR, with its own schema change, backend, frontend, translations and tests. At the end of each slice, something works that Wellness Albania can see or that a test proves. |
| Date | 06.10.2026 |

---

## 1. How to read this plan

Milestone 4 is split into **17 slices**. Together they cover every Must, Should and Could requirement in the SRS. Section 6 maps each requirement to its slice, and when a requirement is split across slices, the split is stated there and in each slice. Each slice lists:

- **Goal**: what works when the slice is merged.
- **Requirements**: SRS IDs the slice delivers, fully or partly.
- **Depends on**: slices that must be merged first.
- **Backend / Frontend / Data**: the work, pointing at the code that exists today.
- **Tests**: what has to be tested first (TDD, per `.agentrules`).
- **Done when**: the demo or check that closes the slice.

Size is relative: **S** = a few days, **M** = about a week, **L** = more than a week.

### 1.1 Slice overview

| # | Slice | Size | Depends on | Unlocks UAT |
|---|---|---|---|---|
| 1 | Membership domain rules (tiers, terms, effective tier, prices, KPI formulas) | M | — | — (proves NFR-ACC-05) |
| 2 | Wellness+ permissions, role upgrade, redaction lists | M | — | UAT-9 step 3 (partial) |
| 3 | Wellness+ settings & benefit table | L | 2 | **UAT-8** (steps 1, 3) |
| 4 | Member record: register, search, status, history | L | 1, 2, 3 | UAT-3 step 1 |
| 5 | Membership payments, renewals, upgrades, void, receipts | L | 1, 3, 4 | **UAT-3** (steps 1–4, 6) |
| 6 | Family members | M | 5 | **UAT-3** (step 5) |
| 7 | VIP requests and approval | M | 4 | **UAT-5** (steps 1–2) |
| 8 | Member daily job: expiry, downgrade, notifications | L | 5, 7 | **UAT-4**, UAT-5 step 3 |
| 9 | Corporate employees: upload, preview, confirm | L | 3, 4 | **UAT-1** |
| 10 | Employer contract link, former employees, company tab | L | 8, 9 | **UAT-2** |
| 11 | Digital member card page (token, QR, benefits, replace link) | L | 3, 4 | UAT-6 steps 1, 3 (online), 4 |
| 12 | Installable card: manifest, offline, anti-screenshot | M | 11 | **UAT-6** (steps 2, 3 offline) |
| 13 | Reception & partner-clinic verification | L | 3, 11 | **UAT-7**, UAT-8 step 2 |
| 14 | Wellness+ reports | L | 5, 8, 10 | UAT-9 steps 1, 4 |
| 15 | CEO dashboard Wellness+ block | S | 14 | UAT-9 step 2 |
| 16 | Data protection: anonymise, export, retention | M | 4, 11 | UAT-9 step 5 |
| 17 | Milestone hardening & UAT readiness | M | all | **UAT-1..10 on staging** |

### 1.2 Dependency graph and parallel tracks

```
1 Domain rules ─┐
2 Permissions ──┼─► 4 Member record ─┬─► 5 Payments ─┬─► 6 Family
3 Settings ─────┘          │         │               └─► 8 Daily job ─┬─► 10 Contract link ─┐
                           │         └─► 7 VIP ──────────► 8            │                     │
                           │                                            │                     ├─► 14 Reports ─► 15 CEO block
                           ├─► 9 Employee upload ───────────────────────┘                     │
                           │                                                                  │
                           └─► 11 Card page ─┬─► 12 Installable card                          │
                                  │          └─► 13 Verification                              │
                                  └─► 16 Data protection ──────────────────► 17 Hardening ◄───┘
```

With two developers, a workable split is:

- **Track A (members and money):** 1 → 4 → 5 → 6 → 7 → 8 → 14 → 15
- **Track B (employees and cards):** 2 → 3 → (after 4) 9 → 10 → 11 → 12 → 13 → 16
- **Both:** 17

Slices 1 and 2 are independent and start together. Slice 3 needs the permission keys of Slice 2, and Slice 4 needs the numbering prefix of Slice 3. Track B waits for Slice 4 before Slice 9, so it takes Slice 3 first and can start the QR and scanning spike of Slice 13 (D13) while it waits. Slices 11 to 13 need only the member record, not payments, so Track B can finish the card and verification work while Track A finishes the money rules. Slice 10 needs Slice 8 because the sponsored-tier sync lives in the same job. Slice 14 needs the payments (5), the downgrade reasons (8, 10) and the corporate numbers (9, 10).

---

## 2. Cross-cutting rules (every slice)

The nine M1 rules, the nine M2 rules and the nine M3 rules (M3 plan §2) still apply: TDD with the requirement ID in the test title, Clean Architecture, two schemas, tenant isolation, translations, audit in the same transaction, permissions instead of role names, 360 px, the `Tenant.salesWorkflow` guard, tenant-aware jobs, redaction, matrix coverage, `Money` for money, and the shared daily-job helper. Milestone 4 adds:

1. **Requirement IDs at slice start (NFR-MNT-04).** The first commit of each slice adds that slice's IDs, and only those, to `scripts/srs-requirements.json`, with priority and requirement text copied from the M4 SRS. Update the file's `source` note to name all four SRSs. When a requirement is split, the **first** slice that touches it adds it and names it in a test title.
2. **Membership money is Decimal (NFR-ACC-05).** Fees, discounts, upgrade differences and payment amounts use `Money` and `Percent` (M2 Slice 1). New columns are `Decimal(12,2)` for money and `Decimal(7,2)` for percentages (`Decimal(5,2)` for benefit percentages as in the SRS). The API sends money as strings, the frontend formats and never calculates. Reports sum in the database as `Decimal`.
3. **Every new field is redacted.** Payment fields go in a new `members.payments.view` list in `redactFields.ts`. Member contact fields, the internal note and the verification log go in a `members.view` list. Every Wellness+ field is removed for a user with no Wellness+ permission (FR-RBAC-27). The list is extended in the same slice that adds a field, with a test next to it, and a Reception test runs against every new member response.
4. **Business rules live in the domain.** The effective tier, the validity rule, term dates, the price rule, the downgrade rule, the sponsor end date and every KPI of SRS §9.3 are pure domain functions with table-driven tests, under `backend/src/membership/domain/`. Controllers, SQL fragments and the frontend never repeat them (SRS §2.4).
5. **The effective tier is calculated, never typed (FR-MEM-09).** No endpoint accepts `tier`, an expiry date or a member ID. `Member.currentTier` is written only by the domain-backed actions and the daily job (D2). A test greps the member routes' request schemas for these field names.
6. **New routes join the matrix.** Every route declares its permission with `requirePermission`, so `permissionMatrix.test.ts` and `routeCoverage.test.ts` cover it. The two public routes (card, verification) are the **only** exceptions, listed explicitly in the exemption file with the reason (FR-RBAC-30). Members have no Own, Team or All scope (FR-RBAC-28), so the new permissions have `supportsScope: false`.
7. **Audit.** The new entity types `Member`, `MemberPayment` and `MembershipSettings` are added to `AUDITED_ENTITY_TYPES` and the registry in the slice that first writes them. Every audited write uses the membership module's write-transaction port (modelled on `PrismaContractWriteTransaction.ts`), with the audit entry in the same transaction (FR-AUD-14). **No card token ever appears in an audit entry, a log line or a URL parameter other than the card path** (FR-AUD-16, FR-CRD-08). Verification events go to their own table, not the audit log.
8. **Mobile and translations.** Every new screen is added to the `screens` list in `frontend/tests/e2e/mobile360.spec.ts` in the slice that builds it (NFR-USE-04). Every new string, notification type, tier label, benefit label and status exists in `sq` and `en`, and `npm run check:translations` passes (NFR-I18N-04). The card and public verification pages use their own small namespace so the public bundle stays light; Greek and Italian are added there in Slice 11 (Should).
9. **No medical data, no more personal data than the SRS lists (FR-DPR-01, FR-DPR-03).** No migration adds a national ID, address, photograph or health field. A schema test lists the `Member` columns and fails on any name outside the FR-MEM-02 list.
10. **Out of scope.** No member login or portal, no online registration, no service-usage records, no wallet cards, points or coupons, no email or SMS campaigns, no payment gateway, no clinic accounts, no legal invoices (SRS §1.2). Card-link email is a Could (FR-CRD-11, D18).

---

## 3. Decisions this plan takes (confirm or override)

The SRS leaves these open or asks the plan to decide. The plan assumes the answers below so that work can start. Changing an answer only changes the slices named.

| # | Decision | Assumed answer | Affects |
|---|---|---|---|
| D1 | Where the code lives, and the word "member" | A **new module `backend/src/membership/`** (domain, application, infrastructure, interfaces) and `frontend/src/pages/membership/`. In the code "member" already means a team member (user), so the module, routes and menu say **membership** and **Wellness+**, and Prisma models are `Member`, `MemberTerm`, `MemberPayment`, … (checked: no `Member` model exists today). A member is **not** a `Client` and has no `User`: the employer link is a nullable `employerClientId`. **Guard:** the Wellness+ menu group and routes are available when `Tenant.salesWorkflow = SALES_PROCESS` (the Wellness Albania workspace), as for M2 and M3 behaviour. Confirm if generic workspaces should also see it. | all |
| D2 | Effective tier: calculated, with a stored copy | `Member.effectiveTierOn(terms, sponsorValid, graceDays, date)` is the one function. **Single-member reads (card, Reception, partner page, member page) always calculate** from the terms, so they are right even before the daily job has run (FR-MEM-06, FR-TIR-02). **Lists, filters and "as of now" report counts read `Member.currentTier`**, kept in step by (a) every payment, VIP, correction, import and removal action in its transaction, (b) the daily job, and (c) a sync after any change to an employer's contract (D8). A term that ends today is picked up by the job at the start of the day; reports built on `currentTier` are therefore correct as of the last job run, and the job runs early in the workspace day. A test compares `currentTier` with the calculated tier for every seeded member after each action. | 1, 4, 5, 8, 10, 14 |
| D3 | Terms, closing and restoring | `MemberTerm (tier, source PAID\|SPONSORED\|VIP\|DOWNGRADE\|CORRECTION, startsOn, endsOn, paymentId, followsTermId?, closedEarlyByPaymentId?, originalEndsOn?)`. A sponsored term has `endsOn = null` and no stored end (SRS developer note). An upgrade sets `closedEarlyByPaymentId` and keeps `originalEndsOn` on the earlier paid term, so **voiding the latest payment restores it exactly** (FR-MPAY-06) and removes the term the payment created. `followsTermId` is `@unique`, so the daily job can create at most one downgrade term per ended term, which is what makes it idempotent in the database and not only in the code (NFR-REL-02, NFR-DAT-02). | 1, 5, 8 |
| D4 | Grace days and the downgrade date | A term counts until `endsOn + graceDays` (FR-TIR-02). The downgrade term starts on `endsOn + graceDays + 1` and lasts the Silver term length (FR-TIR-06, FR-TIR-05 example: Gold ends 31.12, 14 grace days, Silver from 15.01). The same `endsOn + graceDays` is the cut-off for "renewed in time" (§9.3 Renewed). The job loops until stable, so a member whose Gold and downgrade Silver terms both ended during a long gap is brought to Bronze in one run, with one history row per step and the correct dates. | 1, 8, 14 |
| D5 | Paying while holding a non-paid term | (a) **A downgrade Silver term**: a Silver payment is kind **New**, starts on the payment date and closes the downgrade term the day before (as an upgrade closes a paid term). It is **not** a renewal, because the term is not paid, and it is **not counted in "Renewals due"** (§9.3 counts Silver and Gold *paid* terms). (b) **A sponsored Silver employee buying Silver**: allowed, with a warning on the screen, because it keeps the person Silver after leaving the company (FR-EMP-12 keeps own paid terms). (c) **A VIP buying a tier**: refused, VIP is the highest tier and nothing to buy. (d) **Bronze to Gold** in one step costs the full Gold price (FR-MPAY-03). Confirm (a) and (b) with Wellness Albania (Q4, Q10). | 1, 5 |
| D6 | Price rule, family discount and the price list | `price(tier, familyDiscount) = round_half_up(fee × (1 − discount))`. An upgrade is `price(newTier) − price(currentPaidOrSponsoredTier)` with the same discount, floored at 0.00. The family discount applies when the **principal** is Active and its **effective tier on the payment date** is Silver, Gold or VIP (FR-FAM-04), checked on the server at the moment of payment, not at link time. The payment stores `listFee`, `discountPercent` and `amount` (FR-MPAY-10), so a later fee change never changes it. The price table in SRS §3.3 is a test fixture, row for row. | 1, 5, 6 |
| D7 | Numbering | `DocumentSequence` (keyed `tenantId, kind, year`) with `kind = MEMBER` and `year = 0` for member numbers (no yearly restart) and `kind = MEMBER_RECEIPT` per calendar year in the workspace time zone, both incremented under a row lock in the create transaction as for offers and contracts. Member number format `WP-000123` (prefix is a setting, six digits); receipt `RCP-2027-000045`. The prefix can change for new numbers, and an issued number is never changed or reused, including after anonymising. `Member (tenantId, memberNumber)` and `MemberPayment (tenantId, receiptNumber)` are unique. A voided payment keeps its receipt number. | 3, 4, 5 |
| D8 | Keeping sponsored Silver in step with contracts | The sponsored term has no end date, so it follows the employer's **contract validity** (M3 `contractValidityWhere`, `Contract.validityOn`; a company with several contracts is valid if any contract is valid today). The **displayed expiry** of a sponsored term is the end of the contract chain valid today: the valid contract's end, extended through any contract that starts on or before the day after it ends (`sponsorEndDate`, pure, FR-EMP-09). Contracts must not import the membership module, so the contracts use cases publish a small application port `ContractValidityChanged(clientId)` (activate, suspend, reinstate, cancel, expire), registered at the composition root. Its membership handler runs **after the contract transaction commits**, re-evaluates the company's employees and records `Company contract ended` or back to Silver with the actor `null` (FR-EMP-10, FR-EMP-11). A failure is logged and **the daily job repairs it** (same code, selects by state), so a contract change is never blocked by Wellness+. | 10 |
| D9 | The daily member job | One job, `MemberTermJob`, on `runDailyJob` (M3 Slice 7), in this order per workspace: (1) paid terms past `endsOn + grace` → downgrade term and tier history (Not renewed); (2) VIP terms past their end → fall back (VIP ended); (3) sponsored sync for every linked employee (Company contract ended, and back to Silver); (4) `currentTier` refresh; (5) notifications: expiring soon (FR-TIR-11), VIP review (FR-VIP-04). Actor is `null` ("system"). Selection is by state against `today`, never "yesterday". Notifications use markers set **after** the emit (`MemberTerm.expiringNotifiedAt`, `VipRequest.reviewNotifiedAt`), so a failure is retried. Same three job tests as M3: twice in a row, after a two-day gap, with a failing notification. Slice 8 builds steps 1, 2, 4, 5; Slice 10 adds step 3. | 8, 10 |
| D10 | Employee import: where the preview lives | `EmployeeImport` holds the parsed rows (JSON, with the classification) from preview until confirmation, as the SRS developer note says, and a random `confirmToken`. Because those rows are personal data, **the row JSON is deleted when the upload is confirmed or after 24 hours unconfirmed**, keeping only counts, the file name, the user and the dates (FR-DPR-03). At confirmation the rows are **classified again inside the transaction** (a member may have been created or linked since the preview). A row that is now refused is reported in the result and not created; the rest are created in the one transaction (FR-EMP-05). Parser, limits and per-row errors reuse `clients/infrastructure/excel/sheet.ts`; content is checked by magic bytes and the `.xlsx` container (a `.xlsm` has a `vbaProject.bin` entry and is refused). Formulas are read as the cell's cached text and never evaluated (FR-EMP-03, NFR-SEC-09). | 9 |
| D11 | Card token and the card link | `Member.cardToken` is unique and comes from `generateShareToken()` (256 bits, above the 128-bit minimum). It is stored as is, because staff must be able to copy, print and export the link (FR-CRD-09, FR-EMP-08). It is **never** put in request logs (the card routes use a redacting path in the logger), audit values, error reports or notifications. Replacing the link (FR-CRD-10) writes a new token and keeps the old one in `MemberCardToken (token, memberId, replacedAt)` **only as a hash**, so the old URL can answer "This card was replaced" while an unknown token answers "Card not found". The two answers differ on purpose for the card page (FR-CRD-10) and are identical for the public verification page (FR-VER-04, FR-VER-09). | 11, 13 |
| D12 | One QR, two pages | The QR holds `<publicBaseUrl>/v/<token>` (FR-CRD-02, FR-VER-08). The card page is `/m/<token>`. The frontend route `/v/:token` asks the server who is calling: a signed-in user with `members.verify` gets the Reception screen from an authenticated endpoint, anyone else gets the public page from the public endpoint. **The decision is made on the server by the permission**, not by a client flag. `publicBaseUrl` is one setting (`PUBLIC_BASE_URL`), the only place a link is built (NFR-OPS-05). A redirect from a previous address is configured in the host and documented in `deploy/DEPLOY.md`. | 11, 13 |
| D13 | QR generation and scanning libraries | **Generate on the server as SVG** with a maintained QR library (checked for licence and size), error correction M, quiet zone, black on white, at least 220 px, so the card works with no client script (FR-CRD-02, NFR-USE-05). **Scan in the browser**: the built-in `BarcodeDetector` where it exists, with a small JavaScript decoder as fallback for iPhone Safari (SRS §8 developer note). Slice 13 **starts with a one-day spike on a real iPhone and a real Android phone** that picks the decoder; if no fallback decodes reliably, search by ID stays the fallback and the spike result is written in the PR. | 11, 13 |
| D14 | Service worker and manifest scope | The manifest is served **per card** at `/public/cards/:token/manifest.webmanifest` (name Wellness+, icons, theme colour, `display: standalone`, `start_url` = the card link). The service worker file is served at `/m/sw.js` with scope `/m/` so it **can never see the staff application**; it caches only the card document, its CSS and the SVG QR, keyed by the card URL, with the "Last updated" marker. A replaced or unknown token returns the same non-cacheable page, so the worker drops its copy (FR-CRD-06, FR-CRD-10). The iOS settings (`apple-mobile-web-app-capable`, title, touch icon) are in the card page head. | 12 |
| D15 | Reports and the "members per tier at the end of each month" | One application query, `GetMembershipReportUseCase`, with one reviewed raw SQL per figure group so both databases give the same numbers (as M3 D10). The monthly series replays the tier history: the last `MemberTierHistory` row on or before the month end, per member, via `ROW_NUMBER()`. **This needs MySQL 8**; Slice 14 begins by confirming the Hostinger version and falls back to a correlated subquery if it is older. The status "Active at the end of the month" needs a status history, so **the plan adds `MemberStatusHistory`** (not in the SRS entity list; FR-MEM-08 and FR-MEM-09 already name a status history). | 4, 14 |
| D16 | Who may anonymise or export a member | The Administrator, through the existing `Wellness+ settings: manage` permission. **No tenth permission** is added, because FR-RBAC-25 lists nine. The action is audited and the audit entry holds no personal value (name, phone, email, birth date are not written to the "before" snapshot of the anonymisation). | 16 |
| D17 | Membership Agent role | Not a sixth system role. The Administrator builds it from the roles screen (copy of Reception plus the nine-key subset in SRS §10.2). **Staging only:** `seedUat.ts` creates it so the scenarios can run, and it is never seeded in production. Because it is a copy of Reception it holds no commercial contract permission, which is what FR-DPR-02 needs; a test proves a copy of Reception with the agent permissions cannot open a contract price or a payment of a company. | 2, 17 |
| D18 | Optional items | FR-CRD-11 (email the card link) is **not built**: it needs a new email template and the SRS puts it behind Q14. FR-DPR-05 (automatic anonymisation after retention) is built in Slice 16 as a **disabled-by-default** setting, because the retention period is still open (Q18). FR-EMP-15 (remove several employees) is built in Slice 10 on the single-removal use case. | 10, 16 |
| D19 | Greek and Italian | Albanian and English are built everywhere. Greek and Italian labels are added to the card and public page namespace in Slice 11 (Should) for the four values of `Member.language`. If Wellness Albania does not supply the texts, the strings fall back to English and a warning is listed in the UAT notes. | 11 |
| D20 | Open questions Q1–Q19 | Build on the SRS's proposed default. The slice each affects is named in that slice. Q1, Q2 → **2, 7**; Q3 → **7, 8**; Q4, Q5 → **1, 8**; Q6, Q7 → **3, 6**; Q8 → **3**; Q9 → **9**; Q10 → **1, 5, 9**; Q11, Q13 → **10**; Q12 → **9, 10**; Q14 → **9, 11**; Q15 → **13**; Q16 → **1, 5**; Q17 → **5**; Q18 → **16**; Q19 → **11, 12**. |

---

## 4. The slices

### Slice 1 — Membership domain rules

**Goal:** Pure domain code decides every membership rule the rest of the milestone depends on: the effective tier, validity, term dates, the price rule, the downgrade rule, the sponsor end date and the KPI definitions. No database, no screen. Tests prove the numbers in the SRS.

**Requirements:** NFR-ACC-05 (domain part) · NFR-ACC-06 (formulas) · FR-MEM-06 (validity) · FR-TIR-02 (effective tier) · FR-TIR-03 (term dates) · FR-TIR-04 (renewal vs new) · FR-TIR-05 (grace) · FR-TIR-06 (downgrade) · FR-TIR-10 (expiring soon) · FR-MPAY-02, 03, 04 (price and upgrade rule) · FR-FAM-04 (discount rule) · FR-VIP-03, 04 (VIP term dates) · FR-EMP-09 (sponsor end date)

**Depends on:** —

**Backend** (all under `backend/src/membership/domain/`, reusing `Money` and `Percent` from M2 Slice 1)
- `Tier.ts`: the four tiers and their order. `canChangeTier(from, to, trigger)` is the SRS §3.2 table.
- `MemberTerm.ts`: the term value object and `Member.effectiveTierOn(terms, sponsorValid, graceDays, date)`. Highest tier among the terms valid on the date, Bronze as the floor, a sponsored term counting only when `sponsorValid`, a term counting to `endsOn + graceDays` (D2, D4).
- `memberValidity.ts`: `validityOn(status, effectiveTier, validUntil)` returns `{ valid, reason: SUSPENDED | CLOSED | null, tier, validUntil | null }`. The tier is never a reason (FR-MEM-06).
- `termDates.ts`: `paidTermDates(kind, paymentDate, currentEnd, months, graceDays)` for New, Renewal and Upgrade (renewal starts the day after the current end, a renewal after the grace window is a New term, end = start + months − 1 day, clamped on shorter months) (FR-TIR-03, FR-TIR-04). `downgradeTerm(endedTerm, graceDays, months)` (D4). `vipTerm(approvalDate, months)` with `reviewDate = endsOn`.
- `membershipPricing.ts`: `price(fee, discount)`, `upgradePrice(...)`, `familyDiscount(principal, date, percent)` (D6), and the purchase checks of D5.
- `sponsorEndDate.ts`: the chain rule of D8.
- `MembershipKpiDefinitions.ts`: the pure formulas of §9.3 on counts and sums: `renewalRate(renewed, due)` (two decimals, `null` when none are due), `renewalsDue`, `revenue`, `downgradeCount` by path and reason, `totalRow`. Slice 14 calls them.
- `expiringSoon(term, today, windowDays)` (FR-TIR-10).

**Tests**
- `FR-TIR-02`: Gold paid + sponsored Silver → Gold; when Gold ends and the contract is valid → Silver; sponsored term with `sponsorValid = false` → Bronze; paid Silver and VIP → VIP.
- `FR-MEM-06`: Gold term ended yesterday is valid as Silver or Bronze today; suspended → "Not valid: Suspended"; the tier is never the reason.
- `FR-TIR-03`: Silver paid 15.03.2027 runs 15.03.2027 to 14.03.2028; renewal paid 01.03.2028 runs 15.03.2028 to 14.03.2029; a 29 February start; a 31 January start.
- `FR-TIR-04`: renewing 20 days early loses no days; paying 3 months after the end is a New term starting that day; with 14 grace days a payment 10 days after is still a renewal.
- `FR-TIR-05`, `FR-TIR-06`: Gold ending 31.12.2027 → Silver 01.01.2028 to 31.12.2028 → Bronze from 01.01.2029; with 14 grace days Gold on 10.01 and Silver from 15.01; a two-year gap steps down twice with the right dates.
- `FR-TIR-10`: window 30 → 31 days left is Valid, 30 days left is Expiring soon.
- `FR-MPAY-02`, `FR-MPAY-03`, `FR-FAM-04`, `NFR-ACC-05`: `it.each` over **every row of the SRS §3.3 price table** (€60.00, €100.00, €40.00, €30.00, €50.00, €20.00, €60.00) and extra rows (family Bronze principal pays full price; discount 33.33% half-up; upgrade never below zero); no float drift.
- `FR-MPAY-04`: Silver paid 15.03.2027 upgraded 15.09.2027 → Silver ends 14.09.2027, Gold 15.09.2027 to 14.09.2028; a sponsored term is left alone.
- `FR-VIP-03`: approved 10.04.2027 → VIP until 09.04.2028, review date the same.
- `FR-EMP-09`: CTR ending 28.02.2027 and a renewal starting 01.03.2027 → sponsor end moves to the new end; a one-day gap does not extend it.
- `NFR-ACC-06`: the §9.3 worked example as a table: revenue €1,140.00, 15 due, 10 renewed, 66.67%, 5 downgrades (3 + 2).

**Done when:** The domain tests pass in CI with no database. They are the reference every later slice uses.

---

### Slice 2 — Wellness+ permissions, role upgrade, redaction lists

**Goal:** The roles screen shows a Wellness+ group with the nine permissions. Every existing workspace receives the SRS §10.2 defaults once, without losing customisation. The audit filter shows the new entity types.

**Requirements:** FR-RBAC-25, 26, 28, 29 · FR-RBAC-27 (field lists and Reception test harness) · FR-AUD-15 (filter group) · FR-DPR-02 (no commercial contract access) · NFR-SEC-07 (matrix expectations) · Q1, Q2

**Depends on:** —

**Data**
- Reuses the `AppliedPermissionUpgrade (tenantId, key, appliedAt)` ledger. No new table.

**Backend**
- `PermissionCatalogue.ts`: add group `wellnessplus` with `members.view`, `members.verify`, `members.manage`, `members.payments.view`, `members.payments.record`, `members.import`, `members.vip.approve`, `members.reports.view` and `wellnessplus.settings.manage`, all `supportsScope: false` (members are workspace-wide, FR-RBAC-28), `milestone: 'M4'`. Labels in `sq` and `en`.
- `DefaultRoleMatrix.ts`: take SRS §10.2. Administrator has all nine. CEO has `members.view`, `members.payments.view`, `members.reports.view` and nothing else (FR-RBAC-29). Reception has `members.verify` only. Sales User and Sales Manager have none.
- `PermissionUpgrades.ts`: add `m4-wellness-plus`, same mechanism as `m3-contracts-payments`: insert only missing keys, only into system roles, never update or delete, one `Role` audit entry per changed role from the system actor, then the ledger row. SQL is generated by `generate-role-seed-sql.ts` in upgrade mode for the Postgres migration and `mysql_migration_m4_wellness_permissions.sql` (folded into `mysql_upgrade_to_current.sql`). `PrismaSystemRoleSeeder.ts` seeds new tenants with the full matrix and the ledger row.
- `redactFields.ts`: add `members.payments.view` (`amount, listFee, discountPercent, receiptNumber, method, receivedOn, payments, revenue, voidReason`) and `members.view` (`phone, email, note, verificationEvents`). A role holding only `members.verify` gets its own exact shape, not a redacted member (Slice 13). Add a "no Wellness+ permission at all" rule that removes every Wellness+ field (FR-RBAC-27). One exported constant per list; each later slice extends it.
- Audit filter registry: add the `membership` group with labels "Member", "Membership payment" and "Wellness+ settings" in `audit.json` (sq/en). The entity types themselves are added to `AUDITED_ENTITY_TYPES` by the slice that first writes them (Slices 3, 4, 5).
- `routeCoverage.test.ts`: an exemption list entry style for routes without login, with a required `reason` (used in Slices 11 and 13).

**Frontend**
- `RolesSettingsContent.tsx`: the Wellness+ group renders with the nine permissions and labels, and the "Milestone 4" tag.

**Tests**
- `FR-RBAC-25`: the catalogue has the nine keys, none scoped; the roles screen lists them under Wellness+.
- `FR-RBAC-26`: the upgrade on a tenant with a customised Reception leaves it unchanged; a permission the Administrator revoked earlier is not restored; running it twice changes nothing; a new tenant gets the full matrix and the ledger row.
- `FR-RBAC-28`, `FR-RBAC-29`: a Sales User gets 403 on a member route (harness test against the first Slice 4 route once it exists; until then against a stub route registered only in the test); the CEO holds the three read keys and no write key.
- `FR-RBAC-27`: `redactFields` removes payment fields without `members.payments.view` and every Wellness+ field for a user with none (written against the fields as each slice adds them).
- `FR-DPR-02`: a custom role copied from Reception with the agent permissions cannot read a contract price, a contract document or a payment of a company.
- `NFR-SEC-07`: `permissionMatrix.test.ts` expectations for the nine keys on the five system roles.
- `FR-AUD-15`: `GET /audit/entity-types` returns the `membership` group.

**Done when:** The roles screen shows the nine keys, the upgrade migration runs on a copy of a populated database without changing any customised role, and the permission matrix tests are green.

---

### Slice 3 — Wellness+ settings & benefit table

**Goal:** The Administrator sets the tier labels, fees and term lengths, the family discount, grace days, the expiring-soon window, the number prefixes, the relationship list and the benefit table. Every workspace gets the seeded defaults, and Reception can read the benefit table.

**Requirements:** FR-TIR-01 · FR-TIR-05 (setting) · FR-TIR-10 (setting) · FR-MEM-03 (prefix setting) · FR-MPAY-05 (receipt prefix setting) · FR-FAM-02 · FR-FAM-04 (setting) · FR-VIP-04 (notice days setting) · FR-BEN-01, 02, 04, 05, 06 · FR-AUD-14 (settings audit) · NFR-OPS-04 (seeds) · NFR-OPS-05 (setting) · NFR-I18N-04 · Q5, Q6, Q7, Q8

**Depends on:** 2

**Data**
- `TierSetting (tenantId, tier, labelSq, labelEn, colour, fee Decimal(12,2)?, termMonths Int?)`, four rows per workspace; `@@id([tenantId, tier])`.
- `MembershipSettings (tenantId PK, familyDiscountPercent Decimal(7,2) default 50, graceDays Int default 0, expiringSoonDays Int default 30, memberPrefix default 'WP', receiptPrefix default 'RCP', vipReviewNoticeDays Int default 30, updatedAt, updatedByUserId)`, in both schemas.
- `FamilyRelationship (id, tenantId, nameSq, nameEn, order, active)`.
- `BenefitService (id, tenantId, nameSq, nameEn, order, active)` and `BenefitDiscount (serviceId, tier, percent Decimal(5,2))` with `@@unique([serviceId, tier])` (NFR-DAT-02).
- The migration **seeds** for every existing tenant: the four tier rows (Bronze free, Silver €60, Gold €100, VIP free, 12 months), the settings row, the relationship list (Spouse or partner, Child, Parent) and the 14 services of SRS §6.1 with VIP equal to Gold. The generator is idempotent, so running the script twice adds nothing (NFR-OPS-04). `PrismaSystemRoleSeeder` / tenant creation seeds the same for new tenants.

**Backend**
- `GetMembershipSettingsUseCase`, `UpdateMembershipSettingsUseCase`, relationship and benefit use cases under `backend/src/membership/application/use-cases/`, each with an audit entry (`MembershipSettings`, old and new values) in the same transaction.
- Domain validation: Bronze and VIP cannot be given a fee; fee ≥ 0.01 for Silver and Gold; term months 1–60; discount 0–100; grace days 0–60; expiring-soon 1–365; prefixes 2–6 uppercase letters or digits; a percentage 0–100 with at most two decimals; labels required in sq and en. A new fee applies only to payments recorded later (nothing stored on old payments, FR-TIR-01).
- Routes under `/membership/settings/*` guarded by `wellnessplus.settings.manage`; `GET /membership/benefits` for `members.view` or `members.verify` (read only, tiers as columns, FR-BEN-04).
- The benefit read model `BenefitsForTier(tier)` returns the active services with their percent, used later by the card and verification. A change applies at once because nothing is cached (FR-BEN-05). No route records service use (FR-BEN-06).
- `PUBLIC_BASE_URL` config validation (NFR-OPS-05): required in production, absolute `https://` URL, no trailing slash.

**Frontend**
- A "Wellness+" section in the settings area with tabs: Tiers and fees, Rules (family discount, grace days, window, prefixes), Relationships, Benefits. The benefit table is an editable grid for the Administrator and read only for Reception (no edit control). Added to `mobile360.spec.ts`. `membership.json` (sq/en).

**Tests**
- `FR-TIR-01`: changing the Gold fee to €110 is accepted and the stored value is `110.00`; a fee on Bronze or VIP is refused; labels required in both languages.
- `FR-TIR-05`, `FR-TIR-10`, `FR-FAM-04`, `FR-MEM-03`, `FR-MPAY-05`: bounds and prefix rules.
- `FR-FAM-02`: a deactivated relationship is not returned for new links and remains on existing ones (checked again in Slice 6).
- `FR-BEN-01`, `FR-BEN-02`: a fresh workspace has the 14 services and the SRS values (table-driven against §6.1, including the empty cells and VIP = Gold); adding "Ultrasound" with 10% Silver stores it; percent above 100 or three decimals refused.
- `FR-BEN-04`: Reception can read the table and gets 403 on every write.
- `FR-BEN-05`: changing Gold physiotherapy from 30% to 35% writes one audit entry with old and new values.
- `FR-BEN-06`: no route or table records service usage (route list check).
- `FR-AUD-14`: each settings change writes one audit entry in the same transaction; a failed audit rolls the change back.
- `NFR-OPS-04`: the seed is idempotent on Postgres and the MySQL script; the migration on a populated copy leaves existing data alone.
- `NFR-OPS-05`: the configured base URL builds links; an invalid value fails startup.

**Done when:** UAT-8 steps 1 and 3 pass locally: the Administrator changes the Gold physiotherapy discount and adds a service, and the audit log shows each change with old and new value. Step 2 completes in Slice 13.

---

### Slice 4 — Member record: register, search, status, history

**Goal:** Authorised staff register members with unique IDs, find them, edit personal details, suspend and close them, and see the member page with its history. The tier is always calculated and never typed.

**Requirements:** FR-MEM-01, 02, 03, 04, 05, 07, 08, 09, 10 · FR-TIR-08 (history table and first rows) · FR-RBAC-28 (enforced) · FR-RBAC-27 (member fields) · FR-DPR-01, 03 · FR-AUD-14 (member) · FR-AUD-15 (type registered) · NFR-DAT-02 (member number, card token) · NFR-SEC-07 · NFR-PERF-05 (list) · NFR-OPS-04 (migration) · Q9

**Depends on:** 1, 2, 3

**Data** (D1, D2, D3, D7)
- `Member (id, tenantId, memberNumber, firstName, lastName, dateOfBirth?, phone?, email?, language default 'sq', cityId?, status, currentTier, employerClientId?, formerEmployerClientId?, leftCompanyAt?, principalMemberId?, relationshipId?, relationshipConfirmedBy?, relationshipConfirmedAt?, cardToken, note?, createdBy, createdAt, closedAt?, anonymisedAt?)`. `@@unique([tenantId, memberNumber])`, `@@unique([cardToken])`. Indexes for the list: `(tenantId, lastName, firstName)`, `(tenantId, currentTier, status)`, `(tenantId, employerClientId)`, `(tenantId, email)`, `(tenantId, phone)`, `(tenantId, dateOfBirth)`. No medical, address, photo or national ID column (rule 9).
- `MemberTerm`, `MemberTierHistory`, `MemberStatusHistory (id, memberId, fromStatus, toStatus, reason, changedByUserId?, createdAt)` (D15). Terms are created here for later slices; a new member has **no term** (Bronze is the floor).
- `DocumentSequence` `kind = MEMBER`, `year = 0`: no schema change.
- Postgres migration and `mysql_migration_m4_members.sql` folded into `mysql_upgrade_to_current.sql`.

**Backend**
- `RegisterMemberUseCase` (`members.manage`): requires first and last name and one of date of birth, phone or email; status Active, start date today, tier Bronze; the number from `DocumentSequence` under a row lock; the card token from `generateShareToken()` (never returned in the create response's audit data); and the `Member` audit entry, in one transaction. No tier-history row is written for a hand-registered Bronze member: Bronze is the floor and the history records tier **changes** (FR-TIR-08). A city is accepted only as a predefined City id (Dimitris, 26.09.2026).
- `FindDuplicateMembers` (domain query + repository): same email, or same phone, or same first name + last name + date of birth, case and spacing normalised. The create route returns `409` with the existing member(s) unless the request carries `confirmDifferentPerson: true` (FR-MEM-04). The import (Slice 9) calls the same finder.
- `UpdateMemberUseCase`: personal details only (name, date of birth, phone, email, language, city, note). Request schemas reject `tier`, `memberNumber`, `status`, dates and tokens (rule 5). Phone, email and name changes are audited with old and new values.
- `ChangeMemberStatusUseCase`: suspend with a required reason, reinstate, close (keeps record and ID) and reopen, each writing `MemberStatusHistory` and audit. There is **no delete route or use case** (FR-MEM-05).
- `SearchMembersUseCase`: search by name, member ID, phone and email; filters tier, status, validity, source (corporate, individual, family), employer company, expiring soon, VIP review due, former employee, and the Area and City of the employer company from predefined ids; paging and sorting; in the database, with the indexes above (NFR-PERF-05). Filters that need later data (`expiringSoon`, `vipReviewDue`, `formerEmployee`) return correct empty results now and get their data in Slices 5, 7 and 10.
- `GetMemberUseCase` → `presentMember.ts`, the one place that decides what each permission receives: all fields, current tier **calculated** with its term dates, term history, tier history, status history, family group (Slice 6 fills it), employer, the internal note, verification events (Slice 13). Payments are included only with `members.payments.view` (Slice 5).
- The routes use `requirePermission('members.view')` or `'members.manage'`; a user holding no Wellness+ permission gets 403 (FR-RBAC-28).
- Add `Member` to `AUDITED_ENTITY_TYPES`.

**Frontend**
- A Wellness+ menu group: **Members** list (search box, filters, badges for tier, status and validity), **New member** form (with the duplicate dialog showing the existing member and "Different person, save"), **Member page** (all fields, tabs for terms, history, status, note with the "no medical information" warning in sq/en, FR-MEM-10) and the edit form for personal details. No tier or expiry control exists. Added to `mobile360.spec.ts`.

**Tests**
- `FR-MEM-01`: create without a last name is refused; with a name and no identifier is refused; a valid member is Bronze, Active, start today.
- `FR-MEM-02`: a field-by-field check of the response; only predefined cities accepted; no field outside the list exists in the schema (`FR-DPR-01`, `FR-DPR-03`).
- `FR-MEM-03`: two parallel creates get consecutive numbers; the prefix setting is used; the ID is not editable; the number is not reused after closing (`NFR-DAT-02`, both schemas).
- `FR-MEM-04`: same email → 409 with the existing member, saved only with the confirmation; same phone; same name and birth date; normalisation of case and spaces.
- `FR-MEM-05`: suspend needs a reason; reinstate restores validity with the same tier; close keeps the number; there is no delete route.
- `FR-MEM-07`: each filter and search by "WP-0001"; sorting; paging; a page of 50 uses a bounded number of queries; 50,000 members returns under 1 s (`NFR-PERF-05`).
- `FR-MEM-08`, `FR-MEM-09`: the page shows fields and histories; sending `tier` or `expiresOn` is rejected; a phone change is audited.
- `FR-MEM-10`: the warning is present in sq and en.
- `FR-RBAC-28`: a Sales User and a Sales Manager get 403 on every member route; a user with only `members.verify` cannot read the list.
- `FR-RBAC-27`: a role with `members.verify` only gets no phone, email or note from the member endpoint.
- `NFR-SEC-07`: a direct API call for every rule and role.
- The migration test: empty tables on a populated tenant, the tier history and status history exist, and `check_migration_state` passes on both databases.

**Done when:** UAT-3 step 1 passes locally (register a Bronze member), and the list finds the member by ID, name, phone and email.

---

### Slice 5 — Membership payments, renewals, upgrades, void, receipts

**Goal:** An authorised agent records payments for new memberships, renewals and upgrades. The amount is calculated, never typed. Each payment gets a receipt number, shows in the payments list, exports to CSV and prints as a PDF receipt. The latest payment can be voided.

**Requirements:** FR-MPAY-01, 02, 03, 04, 05, 06, 07, 08, 09 (rule), 10, 11 · FR-TIR-03, 04 (use cases) · FR-TIR-08 (tier history rows) · FR-MEM-08 (payments on the page) · FR-RBAC-27 (payment fields) · FR-AUD-14 (payments) · FR-AUD-16 (export) · NFR-ACC-05 (schema) · NFR-DAT-02 · Q10, Q16, Q17

**Depends on:** 1, 3, 4

**Data** (D3, D5, D6, D7)
- `MemberPayment (id, tenantId, memberId, kind NEW|RENEWAL|UPGRADE, fromTier, toTier, listFee Decimal(12,2), discountPercent Decimal(7,2), amount Decimal(12,2), method CASH|BANK_TRANSFER|CARD|OTHER, receivedOn, receiptNumber, note?, recordedBy, createdAt, voidedAt?, voidedBy?, voidReason?)`, `@@unique([tenantId, receiptNumber])`, indexes `(tenantId, receivedOn)` and `(memberId, createdAt)`. Immutable except for the three void columns.
- `MemberTerm.paymentId`, `closedEarlyByPaymentId`, `originalEndsOn` (D3) are used here.
- `DocumentSequence` `kind = MEMBER_RECEIPT` per year: no schema change.

**Backend**
- `QuotePaymentUseCase` (`members.payments.record`): given member, kind and target tier, returns the list fee, the family discount line (Slice 6 supplies the principal; until then none), the **amount**, the term dates and the warnings of D5. The amount is always calculated by the Slice 1 functions on the server.
- `RecordMemberPaymentUseCase`: re-runs the quote in the transaction, so the screen's number and the stored one cannot differ; refuses a future date, a VIP target, a lower tier, a closed or suspended member; picks the receipt number under a row lock; creates the paid term (closing the earlier paid term for an upgrade, D3); writes the payment, term, `MemberTierHistory` (reasons Purchase, Renewal, Upgrade), the refreshed `currentTier` and the audit entry in one transaction. A sponsored term is left alone (FR-MPAY-04). The member's payment never creates a sponsored payment (FR-MPAY-09).
- `VoidMemberPaymentUseCase`: only the member's **latest** non-voided payment; reason required; removes the term the payment created, restores the closed term's `endsOn` from `originalEndsOn`, marks the payment voided (receipt stays, marked Voided), writes the tier history (reason Correction) and audit. An earlier payment cannot be voided while a later one exists (FR-MPAY-06).
- `SearchMemberPaymentsUseCase` for `GET /membership/payments`: filters date range, tier, kind, method, agent, status; totals computed in the database as `Decimal`, **excluding voided** (FR-MPAY-07). Open to `members.payments.view`.
- `GET /membership/payments/export.csv` (UTF-8 with BOM, formula-injection protection from rule list), audited with who, when and filters (FR-MPAY-10, FR-AUD-16). One member's payments export from the same use case.
- `GET /membership/payments/:id/receipt.pdf`: pdfkit through a pure `ReceiptDocument` view model and the existing renderer pattern (M2 D3): logo, member name and ID, tier, period, amount, method, receipt number, agent, and the sentence "This is a receipt, not an invoice" in sq and en (FR-MPAY-11).
- `presentMember.ts` includes `payments` and `receiptNumber` only with `members.payments.view`; the redaction lists of Slice 2 are completed (FR-MPAY-08). Add `MemberPayment` to `AUDITED_ENTITY_TYPES`.

**Frontend**
- Member page: a **Record payment** drawer (kind, target tier, method, date) that shows the calculated amount, the list fee, any discount and the new term dates, with **no amount field**; a Payments tab; **Void** on the latest payment with a reason dialog. A **Membership payments** page with filters, totals, Voided marker, CSV and receipt links. The sponsored-Silver and downgrade-Silver warnings of D5 show before saving. Added to `mobile360.spec.ts`.

**Tests**
- `FR-MPAY-01`: the screen for Bronze to Silver shows €60.00 and has no amount field; a posted `amount` is ignored or refused; a future date is refused.
- `FR-MPAY-02`, `NFR-ACC-05`: the SRS price table reproduced through the API; a changed fee applies to the next payment only (`FR-TIR-01` completed).
- `FR-MPAY-03`: Silver to Gold is €40.00; Gold to Silver is not offered; a sponsored Silver employee upgrading pays €40.00; Bronze to Gold pays €100.00.
- `FR-MPAY-04`: the Silver 15.03.2027 → upgrade 15.09.2027 dates; at most one paid term at a time (database check).
- `FR-MPAY-05`: two payments at the same moment get consecutive receipt numbers, per year; the prefix setting is used (`NFR-DAT-02`).
- `FR-MPAY-06`: voiding the upgrade restores the Silver term and its end date and keeps the receipt marked Voided; an earlier payment cannot be voided; a reason is required.
- `FR-MPAY-07`: filtering Upgrade for March 2027 lists only upgrades and their total; voided payments are excluded from totals.
- `FR-MPAY-08`: the Reception and `members.view`-only responses contain no payment field; a user without `members.payments.view` gets 403 on the list.
- `FR-MPAY-09`: after an upload (Slice 9) there are members and no payments (test added there).
- `FR-MPAY-10`: a later fee change leaves earlier payments at the stored amount; the CSV equals the filtered rows; one audit entry; a cell beginning `=` opens as text.
- `FR-MPAY-11`: the PDF values equal the payment's; the not-an-invoice sentence is present in both languages.
- `FR-TIR-03`, `FR-TIR-04`, `FR-TIR-08`: the history lists Silver (Purchase), Gold (Upgrade); a renewal 20 days early loses no day; the D5 downgrade-Silver purchase case.
- Voiding and recording in two parallel requests leave one consistent state.
- The UAT-3 scenario test (steps 1–4 and 6) runs on the seeded tenant.

**Done when:** UAT-3 steps 1–4 and 6 pass locally: Silver €60.00 with an `RCP-yyyy-nnnnnn` receipt, no amount field, upgrade €40.00 with a 12-month Gold term, the void restores Silver and keeps the receipt marked Voided, and Reception sees tier and validity and no payment field.

---

### Slice 6 — Family members

**Goal:** A principal member has a confirmed family group. Family members get the family price on Silver, Gold and upgrades, with the relationship and confirmation stored and shown.

**Requirements:** FR-FAM-01, 02 (use), 03, 04, 05, 06, 07, 08 · FR-AUD-14 (family link, confirmation, removal) · FR-MEM-08 (family group on the page) · Q6, Q7

**Depends on:** 5

**Data**
- Uses `Member.principalMemberId`, `relationshipId`, `relationshipConfirmedBy`, `relationshipConfirmedAt` (Slice 4). Add a `MemberFamilyEvent (id, memberId, principalMemberId?, relationshipId?, kind LINKED|REMOVED, reason?, byUserId, at)` for the history of links and removals, so a removed link is still explainable (FR-FAM-06, FR-FAM-07). Add a check that a member cannot be their own principal (database check where supported, use case otherwise).

**Backend**
- `AddFamilyMemberUseCase` (`members.manage`): creates a new member or links an existing one to a principal; **relationship is required and must be active; the confirmation tick is required**; stores who confirmed and when. Refused if: the member is the principal, the principal is itself a family member (FR-FAM-03), the member already has a principal, or the member is the principal of someone else (a principal cannot be a family member). Creating uses `RegisterMemberUseCase` (duplicate check included).
- `RemoveFamilyLinkUseCase`: reason required; the member keeps all terms and status; later payments use the full price; recorded in `MemberFamilyEvent` and audit (FR-FAM-06).
- `QuotePaymentUseCase` / `RecordMemberPaymentUseCase` (Slice 5): look up the principal and apply `familyDiscount` from Slice 1 on the payment date; the quote returns the line "Family discount, relationship (name)" with list fee, percent and amount; the payment stores them (FR-FAM-05, FR-MPAY-10).
- `presentMember.ts`: the principal's page lists the family group (relationship, tier, validity); a family member's page shows the principal and "Confirmed by (name) on (date)" (FR-FAM-07).
- Sponsored Silver covers the employee only: a family member of an employee gets no term, and the discount follows the employee's effective tier (FR-FAM-08).

**Frontend**
- Member page: a **Family** tab with the group, **Add family member** (new or search an existing member, relationship select, confirmation checkbox) and **Remove link** with a reason. The payment drawer shows the discount line. Added to `mobile360.spec.ts`.

**Tests**
- `FR-FAM-01`: saving without a relationship or without the confirmation is refused; the page shows "Confirmed by (name) on (date)"; the confirmation is audited.
- `FR-FAM-02`: a deactivated relationship is refused for a new link and still shown on an existing one.
- `FR-FAM-03`: linking a family member as the principal of a third person is refused; self-link refused; one principal per member (`NFR-DAT-02`).
- `FR-FAM-04`: principal Gold → family Silver €30.00 and Silver to Gold €20.00; principal Bronze → €60.00; principal Suspended → full price; evaluated on the payment date (principal upgraded later does not change an earlier payment).
- `FR-FAM-05`: the payment shows €60.00, 50%, €30.00 and stores them.
- `FR-FAM-06`: after removal the next Silver renewal is €60.00; the member's terms remain.
- `FR-FAM-07`: both pages show the link; the audit log has the confirmation.
- `FR-FAM-08`: a spouse added to a sponsored Silver employee is Bronze and pays €30.00 for Silver.
- The UAT-3 step 5 scenario test (Gold or Silver principal and a Bronze principal) runs on the seeded tenant.

**Done when:** UAT-3 step 5 passes locally: the spouse pays €30.00 with a Silver or Gold principal and €60.00 with a Bronze principal.

---

### Slice 7 — VIP requests and approval

**Goal:** An agent requests VIP with a reason, and a different user with the approval permission decides. An approval creates a free 12-month VIP term with a review date.

**Requirements:** FR-VIP-01, 02, 03 · FR-VIP-05 (end early) · FR-VIP-04 (approval, review-due filter; notice and fall-back are completed in Slice 8) · FR-AUD-14 (VIP) · NFR-DAT-02 (one open request) · FR-TIR-08 (VIP approved, VIP ended) · Q2, Q3

**Depends on:** 4

**Data**
- `VipRequest (id, tenantId, memberId, requestedBy, reason, status PENDING|APPROVED|REJECTED|WITHDRAWN, decidedBy?, decidedAt?, decisionNote?, reviewNotifiedAt?, createdAt)`. **One open request per member** is a unique index on `(memberId)` where `status = PENDING` (PostgreSQL partial index; on MySQL the use case checks inside the transaction, as M3 D9).
- `MemberTerm` rows with `source = VIP` (Slice 4).

**Backend**
- `RequestVipUseCase` (`members.manage`): reason required; refused for a closed member or one with an open request.
- `DecideVipRequestUseCase` (`members.vip.approve`): approve or reject; rejection needs a reason; **a user cannot decide a request they made themselves** (FR-VIP-02, also when the same person holds both permissions). Approve creates the VIP term from today for the VIP length (D4 of the SRS: default 12 months) with no payment, a tier history row (VIP approved), refreshed `currentTier`, audit. A new approved request before the end extends VIP from the next day (FR-VIP-04). No payment row is ever created (FR-VIP-03).
- `EndVipUseCase` (`members.vip.approve`): reason required; ends the VIP term today; the member falls to the highest other valid tier, Bronze if none; history reason VIP ended (FR-VIP-05).
- `SearchMembersUseCase` gets the filter `vipReviewDue` (a VIP term ending within the notice days).
- Request, decision and ending show on the member page (`presentMember`) and in the audit log.

**Frontend**
- Member page: a **VIP** section with **Request VIP** (reason), the open request, and for approvers **Approve / Reject / End VIP**. A "VIP requests" list for approvers. The member list filter "VIP review due". Added to `mobile360.spec.ts`.

**Tests**
- `FR-VIP-01`: a request without a reason is refused; a second open request is refused; two parallel requests create one (`NFR-DAT-02`, both schemas).
- `FR-VIP-02`: an Administrator who made a request gets an error approving it; a second approver can; a user without the permission gets 403 (the Membership Agent preset cannot approve); rejection needs a reason.
- `FR-VIP-03`: approved 10.04.2027 → VIP until 09.04.2028, review date 09.04.2028, history reason "VIP approved", no payment.
- `FR-VIP-04`: an approval before the end extends from the next day; the review-due filter lists the member 30 days before the end.
- `FR-VIP-05`: ending VIP makes the member Bronze (or the highest other valid tier) the same day, with the reason in the history.
- `FR-AUD-14`: request, decision and ending each write one audit entry.
- The UAT-5 steps 1–2 scenario test runs on the seeded tenant.

**Done when:** UAT-5 steps 1 and 2 pass locally: approving one's own request is refused and approving the agent's request creates a free 12-month VIP term with a review date.

---

### Slice 8 — Member daily job: expiry, downgrade, notifications

**Goal:** A daily job downgrades members whose paid terms ended without renewal, ends VIP terms that were not re-approved, and notifies the right people once. Running it twice or after a gap gives the same result.

**Requirements:** FR-TIR-05, 06, 07 · FR-TIR-08 (system rows) · FR-TIR-09 (correction) · FR-TIR-10 (badge and list) · FR-TIR-11 · FR-VIP-04 (notice and fall-back) · NFR-REL-02 · NFR-DAT-02 (one downgrade term per ended term) · Q3, Q4, Q5

**Depends on:** 5, 7

**Data**
- `MemberTerm.followsTermId @unique`, `MemberTerm.expiringNotifiedAt` (D3, D9). `VipRequest.reviewNotifiedAt` exists from Slice 7.

**Backend**
- `MemberTermJob` on `runDailyJob` (D9), steps 1, 2, 4 and 5:
  - Step 1: paid terms with `endsOn + graceDays < today` and no following term → create the downgrade term (Gold → Silver for 12 months from `endsOn + graceDays + 1`; Silver → nothing, the member is Bronze), tier history reason Not renewed, actor `null`. It loops until stable (D4). `followsTermId` makes a second run a no-op in the database.
  - Step 2: VIP terms past their end with no extension → history reason VIP ended.
  - Step 4: `currentTier` recalculated for the members touched.
  - Step 5: one notification (type `MEMBERSHIP_EXPIRING`, sq/en) per paid term entering the expiring window, to every user holding `members.payments.record`, **as one daily summary per workspace** (FR-TIR-11 allows it); one notification (`VIP_REVIEW_DUE`) to every user holding `members.vip.approve` `vipReviewNoticeDays` before the review date. Markers are set after the emit; a failed send is retried.
- `CorrectMemberTierUseCase` (`wellnessplus.settings.manage`): tier, required reason and end date; creates a `CORRECTION` term and a history row with reason Correction; audited (FR-TIR-09).
- `SearchMembersUseCase` gets `expiringSoon` (a paid term ending in the window, Slice 1 `expiringSoon`) and the member page shows the Expiring soon badge.
- The scheduler registers the job in `createScheduler.ts`; `Scheduler.test.ts` covers the registration.

**Frontend**
- Expiring soon badge on the list and the member page; a **Correct tier** dialog for the Administrator; notifications render in the notification centre (sq/en). No new page: the Expiring memberships list arrives in Slice 14.

**Tests**
- `FR-TIR-06`: Gold ending 31.12.2027 not renewed → Silver 01.01.2028 to 31.12.2028, then Bronze 01.01.2029 (job run on each date); Silver not renewed → Bronze.
- `FR-TIR-05`: with 14 grace days a Gold term ending 31.12 is Gold on 10.01 and Silver from 15.01.
- `FR-TIR-07`, `NFR-REL-02`: a Gold term ending yesterday becomes Silver on the next run with `changedByUserId = null`; a second run adds no term, history or notification; after a two-day gap the result equals two daily runs; after a long gap the member steps down twice in one run with correct dates; one failing workspace does not stop the others; `Europe/Tirane` at 23:30 and 00:30 around a date change.
- `FR-TIR-08`: the history of the example member lists Silver (Purchase), Gold (Upgrade), Silver (Not renewed) with dates.
- `FR-TIR-09`: a correction to Gold until 31.12.2027 appears in the history and in the audit log; a user without the permission gets 403.
- `FR-TIR-10`: a term ending in 30 days is Expiring soon, in 31 days is Valid.
- `FR-TIR-11`: one summary notification; no second one on the second run; a failing notification is retried.
- `FR-VIP-04`: the approvers are notified once, 30 days before the review date; a VIP whose term ended is Bronze the next day by the system.
- `NFR-DAT-02`: two simultaneous job runs create one downgrade term per ended term.
- The UAT-4 scenario test (steps 1–4) and UAT-5 step 3 run on the seeded tenant.

**Done when:** UAT-4 passes locally: the seeded Gold member is Silver for 12 months, the paid Silver member is Bronze, both by the system with the reason Not renewed, the second run changes nothing, the agents are notified once, and the 20-day renewal starts the day after the current end with no day lost.

---

### Slice 9 — Corporate employees: upload, preview, confirm

**Goal:** An agent uploads an employee list for a company with a valid contract, reads a preview that classifies every row, confirms, and gets sponsored Silver members with IDs and a result file. Uploading the same file again changes nothing.

**Requirements:** FR-EMP-01, 02, 03, 04, 05, 06, 07, 14 · FR-MPAY-09 (no payment created) · FR-MEM-04 (duplicates) · FR-MEM-03 (IDs) · FR-TIR-08 (reason Import) · FR-AUD-14 (upload) · NFR-SEC-09 · NFR-PERF-05 (upload) · NFR-DAT-02 · Q9, Q10, Q12, Q14

**Depends on:** 3, 4

**Data** (D10)
- `EmployeeImport (id, tenantId, clientId, fileName, uploadedBy, status PREVIEWED|CONFIRMED|EXPIRED, rows Json?, confirmToken, created, linked, skipped, errors, createdAt, confirmedAt?)`, index `(tenantId, clientId, createdAt)`. `rows` is cleared on confirmation or expiry.
- `MemberTerm` rows with `source = SPONSORED`, `endsOn = null`.

**Backend**
- `GET /membership/employee-template.xlsx`: columns First name\*, Last name\*, Date of birth, Phone, Email, Language, with a header note; Albanian and English headers are both accepted by the parser (FR-EMP-02).
- `PreviewEmployeeImportUseCase` (`members.import`): the company must have a **valid contract today** (M3 `contractValidityWhere`; several contracts: valid if any is valid), otherwise a `NO_VALID_CONTRACT` refusal that states the reason (FR-EMP-01). The file is checked by content: `.xlsx` container, no macro part, 2 MB, 1,000 rows, first sheet, blank rows ignored, cells as text, formulas not evaluated (FR-EMP-03, NFR-SEC-09). Each row is classified **New member**, **Existing member to link** (found by the FR-MEM-04 finder and not linked elsewhere), **Skipped** (already linked to this company, or repeated in the file), **Linked to another company (refused)**, or **Error** (row number and reason) (FR-EMP-04). Nothing is created; the response is the preview with counts and a `confirmToken`.
- `ConfirmEmployeeImportUseCase`: classifies again inside the transaction (D10), creates each new member (number, card token, employer, language, tier history reason Import, a sponsored Silver term from today), and links each existing member with a sponsored Silver term (their paid term continues; effective tier is the higher, Q10). One transaction: a failure on any row creates nothing (FR-EMP-05). Writes the `EmployeeImport` counts, clears the row JSON, and writes one `Member` audit entry for the upload (company, counts, file name, no personal values) (FR-AUD-14).
- `GET /membership/employee-imports/:id/result.xlsx`: skipped and error rows with the row number and reason (FR-EMP-06). A second upload of the same file reports every row as Already linked (FR-EMP-07).
- A **member linked to another company** is refused; one employer at a time (FR-EMP-14, Q12).
- A purge in the daily job removes `PREVIEWED` rows older than 24 hours (set to `EXPIRED`, JSON cleared).
- No email or message goes to the employees (FR-EMP-08 note).

**Frontend**
- The Wellness+ menu **Employee upload** page and the Wellness+ tab button on the company page (the tab itself is completed in Slice 10): choose company, download template, upload, **preview table** with the five classes and counts, **Confirm**, then the result with the error file download. A refusal for a company with no valid contract shows the reason. Added to `mobile360.spec.ts`.

**Tests**
- `FR-EMP-01`: a company whose only contract has expired is refused with "No valid contract"; with a valid contract the preview starts; a company with one expired and one valid contract is valid.
- `FR-EMP-02`: a row without a last name or without any identifier is reported with its row number; Albanian headers accepted; empty language defaults to `sq`.
- `FR-EMP-03`, `NFR-SEC-09`: a renamed `.exe` and a `.xlsm` are refused; 1,001 rows refused with the limit stated; a `=HYPERLINK(...)` cell is read as plain text.
- `FR-EMP-04`: the 5-row file (one repeated, one existing, one error) previews 2 New, 1 Existing, 1 Skipped, 1 Error and creates nothing before confirmation (checked against the database).
- `FR-EMP-05`: confirming creates 2 Silver members with IDs and links the existing one; a forced failure on row 3 leaves no member and no term; a row that became refused between preview and confirmation is reported, not created.
- `FR-EMP-06`: the result file lists the refused row with "Linked to another company"; the upload appears in the history with counts.
- `FR-EMP-07`: the same file twice shows only Skipped rows the second time.
- `FR-EMP-14`: a member linked to another company is refused.
- `FR-MPAY-09`: after the upload there are members and **no payment**.
- `FR-MEM-04`: a row matching an existing person is classified Existing, never created twice.
- `FR-TIR-08`: the history shows Silver with the reason Import.
- A 1,000-row preview under 15 s and its confirmation under 30 s (`NFR-PERF-05`).
- The preview JSON is gone after confirmation and after 24 hours.
- The UAT-1 scenario test runs on the seeded tenant.

**Done when:** UAT-1 passes locally: the preview shows 2 New, 1 Existing, 1 Skipped, 1 Error, nothing is created before confirming, after confirming there are 2 Silver members with IDs, the existing member is linked, an error file exists, the upload is in the company history and no payment was created; the second upload shows only Skipped; a company without a valid contract is refused.

---

### Slice 10 — Employer contract link, former employees, company tab

**Goal:** Sponsored Silver follows the employer's contract without anyone touching the members. Employees who leave are removed and listed as former employees. The company page has a Wellness+ tab.

**Requirements:** FR-EMP-09, 10, 11, 12, 13, 15 · FR-MEM-11 · FR-MEM-07 (former employee filter) · FR-TIR-07 (sponsor sync in the job) · FR-TIR-08 (reasons Company contract ended, Left company) · NFR-REL-02 · FR-AUD-14 (removal) · Q11, Q12, Q13

**Depends on:** 8, 9

**Backend**
- **Sponsored validity.** `SponsorValidity` (application layer): per employer company, today's validity from the M3 contract rule and `sponsorEndDate` from Slice 1 (D8). It is batched per page, never one query per member. `presentMember` shows the displayed expiry of a sponsored term from it (FR-EMP-09).
- **Contract change hook.** The contracts module publishes `ContractValidityChanged(clientId)` after the commit of activate, suspend, reinstate, cancel and expire (D8). The membership handler `SyncEmployerMembersUseCase` re-evaluates the company's linked employees: it writes `Company contract ended` or back to Silver, refreshes `currentTier`, actor `null`. A failure is logged and the job repairs it.
- **Job step 3.** `MemberTermJob` gets the sponsored sync for every linked employee, so a contract that expired overnight is recorded the same morning, a renewal contract with no gap writes **nothing** (the member stays Silver, the date moves, FR-EMP-09), and a new contract after a gap makes the employees Silver again (FR-EMP-11). Suspended contracts make employees Bronze while suspended and Silver after reinstating. A history row is written only on a real change, so a second run adds nothing.
- `RemoveEmployeeUseCase` (`members.manage`): leaving date (default today), optional reason; clears `employerClientId`, sets `formerEmployerClientId` and `leftCompanyAt`, ends the sponsored term, keeps own paid and VIP terms, writes history `Left company` and audit (FR-EMP-12). `RemoveEmployeesUseCase` for a selection, one history row each, in one transaction (FR-EMP-15).
- `SearchMembersUseCase` gets the `formerEmployee` filter with company and leaving date (FR-EMP-13).
- `GET /clients/:id/membership` returns the tab data: members with the count per tier, former employees, upload history, and "N members of M employees" using the company's employee count (FR-MEM-11). Open to `members.view`.

**Frontend**
- Company page: a **Wellness+** tab with the summary line, the member list with tier counts, former employees, **Upload employees** and the upload history. Member page: **Remove from company** with date and reason, and bulk removal from the tab. The "Former employee" label on the member. Added to `mobile360.spec.ts`.

**Tests**
- `FR-EMP-09`: CTR ending 28.02.2027 and a renewal starting 01.03.2027 → on 01.03.2027 the employees are Silver and show the new end date, with **no history row and no action** (`UAT-2` step 4).
- `FR-EMP-10`: the day after the contract ends the employees are Bronze, the history shows "Company contract ended" by the system; the effect is visible on the card calculation **before the job runs**; a second run changes nothing; a company with one expired and one valid contract keeps Silver.
- `FR-EMP-11`: reinstating a suspended contract returns the employees to Silver the same day via the hook; a new contract after a gap makes them Silver again while still linked; a failing hook is repaired by the next job run.
- `FR-EMP-12`: removing a sponsored Silver employee makes the member Bronze today and lists them as a former employee; a paid Gold term of the same member is untouched; history "Left company".
- `FR-EMP-13`: the filter lists only members removed from that company.
- `FR-EMP-15`: removing 5 selected members creates 5 history entries in one transaction.
- `FR-MEM-11`: the tab of a company with 12 members and 40 employees shows "12 members of 40 employees".
- `NFR-REL-02`: the sponsor sync step twice, after a gap, with a failing notification.
- Query count: a company page with 200 employees uses a bounded number of queries.
- The UAT-2 scenario test (steps 1–5, with a fixed clock) runs on the seeded tenant.

**Done when:** UAT-2 passes locally: Bronze while suspended and Silver after reinstating; after the end date Bronze with "Company contract ended" by the system; after the renewal Silver with the new expiry and no action on the members; the removed employee is Bronze and a former employee while the others stay Silver.

---

### Slice 11 — Digital member card page

**Goal:** Each member has a private card link that opens, without login, a card with logo, name, ID, tier, valid-until date, QR code and benefits, and nothing else personal. Staff can show, copy, print and replace the link.

**Requirements:** FR-CRD-01, 02, 03, 04, 08, 09, 10, 12 · FR-CRD-11 (not built, D18) · FR-BEN-03 · FR-EMP-08 (card links sheet) · FR-RBAC-30 (public exceptions) · NFR-SEC-07 (tokens) · NFR-SEC-08 · NFR-USE-05 · NFR-I18N-04 (card languages) · NFR-OPS-05 (links) · FR-AUD-16 · Q14, Q19

**Depends on:** 3, 4

**Data** (D11)
- `MemberCardToken (id, memberId, tokenHash, replacedAt)`; the hash is SHA-256 of the replaced token. The current token is `Member.cardToken` (Slice 4).

**Backend** (follows `publicQuotationRoutes`: outside tenant and login middleware)
- `GET /public/cards/:token` → `PublicCardPresenter`: member name, ID, effective tier **calculated now**, validity ("Valid until dd.mm.yyyy" or "No expiry" for Bronze), the benefits of the tier from `BenefitsForTier`, language, and the QR as server-made SVG (D13). It returns **no** phone, email, date of birth, employer, payment, status history or any internal field (FR-CRD-01, enforced by an allow-list presenter and a response-shape test). A suspended or closed member gets "Membership not valid, contact Wellness Albania" with no QR and no discounts (FR-CRD-03, FR-BEN-03).
- Uniform answers: an unknown or malformed token → one neutral "Card not found" page with the same status for both; a **replaced** token → the "This card was replaced. Ask Wellness Albania for the new link." message (D11). `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `noindex` meta, no analytics or third-party scripts. The route is rate-limited per IP, default 60 requests per hour, from settings (NFR-SEC-08). The token is redacted in access logs and error reports.
- `ReplaceCardLinkUseCase` (`members.manage`): new token in one transaction with storing the old one's hash, audited with who and when and **no token** (FR-CRD-10, FR-AUD-16).
- `GET /membership/members/:id/card-link` (`members.manage`): returns the link built from `PUBLIC_BASE_URL`, for show, copy and print. `GET /membership/employee-imports/:id/card-links.xlsx` (`members.manage`): name and link per member of an upload, audited (FR-EMP-08).
- The privacy line text (FR-CRD-12) is a setting in sq and en with a neutral placeholder until Wellness Albania supplies it (SRS §12.3).
- `routeCoverage` exemption entries for the public card routes, each with a reason (FR-RBAC-30).

**Frontend**
- A public card page at `/m/:token` in a small separate bundle and namespace (rule 8): the Wellness+ logo and palette, the tier colour from `TierSetting`, QR on a white square with a quiet zone at 220 px or more even in dark mode (NFR-USE-05), the benefits as "Your benefits", the language switch (sq/en, plus el/it for members who have them, D19), and the privacy line.
- Member page: **Show card** (QR), **Copy link**, **Print card** (credit-card size and A6 print styles) and **Replace link** with a confirm. Added to `mobile360.spec.ts` where it is a staff screen; the public page has its own 360 px test.

**Tests**
- `FR-CRD-01`: the response shape for a Gold member contains exactly the allowed fields (snapshot of the key set); no phone, email, birth date, employer or payment.
- `FR-CRD-02`: the QR payload equals `<base>/v/<token>`; the SVG has error correction M, a quiet zone and is 220 px or more; decoded with the chosen decoder in a unit test.
- `FR-CRD-03`: after a Gold to Silver downgrade the same link shows Silver; a suspended member has no QR and no discounts.
- `FR-CRD-04`: switching to English changes every label including the tier name and the instructions; Greek and Italian only for members who have them.
- `FR-CRD-08`: a wrong, malformed and unknown token return the same page and status; a replaced token returns its message; `noindex` and `no-store` headers; the 61st request in an hour from one IP is refused; no token in the access log, an error report or an audit entry (a test greps captured logs and audit rows).
- `FR-CRD-09`: the print view shows name, ID, tier and QR; copy link returns the configured base URL.
- `FR-CRD-10`: after replacing, the old link shows the replaced message and the new link shows the card; the audit entry has no token.
- `FR-CRD-12`: the privacy line is visible in both languages.
- `FR-BEN-03`: a Silver member sees 50% for the preventive check-up; a suspended member sees none.
- `FR-EMP-08`: the sheet contains one link per member of the upload and an audit entry exists.
- `NFR-SEC-07`: the token comes from the CSPRNG generator, is at least 128 bits and is unique in the database.
- `NFR-USE-05`: the white square and quiet zone are present in the dark-mode style.
- `NFR-OPS-05`: changing the base setting changes new links.

**Done when:** UAT-6 steps 1 (desktop and emulation), 3 (language) and 4 (replace link) pass locally. The real iPhone and Android run happens in Slice 12.

---

### Slice 12 — Installable card: manifest, offline, anti-screenshot

**Goal:** A member adds the card to the iPhone or Android home screen and opens it full screen. In flight mode the last card shows with its time. A screenshot can be told apart from a live card.

**Requirements:** FR-CRD-05, 06, 07 · NFR-USE-04 (real devices) · NFR-SEC-08 (no cache of replaced) · Q19

**Depends on:** 11

**Backend / hosting**
- `GET /public/cards/:token/manifest.webmanifest` (D14): name "Wellness+", short name, icons (192, 512, maskable, and the apple touch icon), `theme_color`, `background_color`, `display: standalone`, `start_url` = `/m/<token>`, `scope` = `/m/`. An unknown or replaced token returns the neutral not-found. The manifest is rate-limited with the card limit.
- `/m/sw.js` served with `Service-Worker-Allowed: /m/` and no cache header on the worker itself.
- The static icons are added to `frontend/public` (they come from the Wellness Plus brand assets, M1 Slice 1).

**Frontend**
- The card page registers the service worker at scope `/m/` **only on `/m/`**; the staff application never registers one (a test fails if `navigator.serviceWorker.register` appears outside the card entry).
- The worker caches only the card document, its assets and the SVG QR keyed by URL, with a stored timestamp; when the network fails the page shows the cached card with "Last updated dd.mm.yyyy hh:mm"; when the server answers "replaced" or "not found" the worker deletes its copy and shows the message (so a replaced home-screen card stops working at the next online open, FR-CRD-10).
- Short install instructions per platform in the member's language ("Share, Add to Home Screen" in Safari; "Install" or "Add to Home screen" in Chrome), shown until the page runs in standalone mode.
- Today's date and a small moving element on the card (CSS animation, respects reduced-motion by switching to a visible second counter), so a screenshot is distinguishable (FR-CRD-07).
- `apple-mobile-web-app-capable`, status bar and title meta, and `apple-touch-icon`.

**Tests**
- `FR-CRD-05`: the manifest has the required fields, `start_url` contains the token, the scope is `/m/`, the icons resolve; an unknown token has no manifest.
- `FR-CRD-06`: with the network off the worker returns the cached card with the marker (service-worker unit test with a fake cache); a "replaced" answer clears the cache.
- `FR-CRD-07`: the date on the card equals today and the moving element exists (component test).
- The staff application has no service worker registration (static check).
- The device checklist (below) is added to `deploy/uat-milestone-4.md` in Slice 17.

**Done when:** UAT-6 passes on a real iPhone (Safari) and a real Android phone (Chrome): the card is added to the home screen with the Wellness+ icon, opens full screen, shows the last values with the time in flight mode, switches language, and the replaced link and the old home-screen copy show "This card was replaced". The results are recorded in the PR.

---

### Slice 13 — Reception & partner-clinic verification

**Goal:** Reception scans the QR code or searches, sees Valid or Not valid with tier, date of birth and discounts, and records the identity check. A partner clinic scanning with an ordinary phone sees Valid or Not valid with name, ID, tier and valid-until date only.

**Requirements:** FR-VER-01, 02, 03, 04, 05, 06, 07, 08, 09, 10 · FR-BEN-03 (verification screen) · FR-BEN-04 (benefit table for Reception) · FR-RBAC-27 (Reception shape) · FR-RBAC-30 (public exception) · NFR-SEC-07 · NFR-SEC-08 (verification limit) · NFR-PERF-05 (verification) · NFR-USE-04 · Q15

**Depends on:** 3, 11

**Data**
- `VerificationEvent (id, tenantId, memberId?, channel RECEPTION_SCAN|RECEPTION_SEARCH|PARTNER_SCAN, userId?, result VALID|NOT_VALID|NOT_FOUND, identityChoice CONFIRMED|MISMATCH|NONE, ipHash?, createdAt)`, index `(tenantId, memberId, createdAt)`. The IP is stored only as a keyed hash (HMAC with a server secret), never readable (FR-VER-10).

**Start of the slice: a one-day spike** (D13) on a real iPhone and a real Android phone. It decides the QR decoding library, and its result and the camera permission behaviour are written in the PR. Camera access needs HTTPS (staging and production already serve it).

**Backend**
- `VerifyMemberUseCase` (`members.verify`): by member id (from a scan) or by search of member ID, name, phone or email. It returns the **exact** shape of FR-VER-02 through `presentMemberForVerification`: Valid or Not valid, name, member ID, tier, valid until, status and date of birth, and the discounts of the effective tier (none for a suspended or closed member). No payment, fee, phone, email or employer. The response is calculated from the server at that moment and carries `no-store` (FR-VER-05).
- `RecordVerificationUseCase`: stores the channel, the user, the result and the identity choice (Identity confirmed / Does not match) (FR-VER-03, FR-VER-06).
- **One link, two pages** (D12): `GET /membership/verify/by-token/:token` (login and `members.verify`) returns the Reception shape; `GET /public/verify/:token` (no login) returns the public shape: Valid or Not valid and, only for a valid member, full name, member ID, tier and valid-until date. **Every reason for not valid gives the same neutral "Not valid"**, and an unknown or replaced token gives "Member not found", so suspended and closed members are indistinguishable from each other and from unknown cards on the public page (FR-VER-04, FR-VER-09). The public route is rate-limited per IP, default 300 requests per hour, a setting (NFR-SEC-08), and writes a `PARTNER_SCAN` event with the hashed IP (FR-VER-10).
- `routeCoverage` exemption entry for the public verification route with its reason.

**Frontend**
- A **Verify member** screen in the main menu for `members.verify`: **Scan** (camera, decoder from the spike, permission and "no camera" messages) and a search box; a large Valid / Not valid result; name, ID, tier, valid until, status, date of birth; the discounts list; **Identity confirmed** and **Does not match** buttons. Works on phone, tablet and desktop with a webcam (FR-VER-01). Reception keeps its landing page and gets this menu item (FR-DSH-16). The **benefit table** page is readable by Reception, with no edit control (FR-BEN-04).
- `/v/:token` route: asks the server whether a staff session with `members.verify` exists; shows the Reception screen or the public page (D12).
- Member page: the verification log for users with `members.view` (FR-VER-06).
- Added to `mobile360.spec.ts`; the public page has its own 360 px test.

**Tests**
- `FR-VER-01`: search by ID, name, phone and email returns the member; the scanned id resolves.
- `FR-VER-02`: the API response for Reception contains **exactly** these fields (key-set snapshot); a suspended member shows "Not valid: Suspended" with no discounts; no payment, phone, email or employer.
- `FR-VER-03`: both identity buttons exist; "Does not match" is stored and shows on the member page.
- `FR-VER-04`: an unknown or replaced token shows "Member not found" and nothing else.
- `FR-VER-05`: after a suspension the next verification shows Not valid (no caching, `no-store`).
- `FR-VER-06`: two verifications appear on the member page with user and time.
- `FR-VER-07`: the public page shows name, ID, tier and valid until for a valid member and nothing else (key-set snapshot); no date of birth, contact, employer, payment or discounts.
- `FR-VER-08`: the same token opened by a Reception session and without a session returns two different shapes; a session without `members.verify` gets the public one.
- `FR-VER-09`: suspended, closed and unknown token give the same wording and status on the public route.
- `FR-VER-10`: a log row exists per public scan with a hashed IP and no readable address.
- `NFR-SEC-08`: 300 verifications from one IP are served and the 301st is refused; the limit setting is read.
- `NFR-PERF-05`: Reception and public verification under 1 s with 50,000 members.
- `FR-BEN-03`, `FR-BEN-04`: the discounts shown equal the table for the effective tier; Reception reads the table and cannot edit.
- The UAT-7 scenario test (steps 1–5) and UAT-8 step 2 run on the seeded tenant; the camera steps run on the real devices.

**Done when:** UAT-7 passes on a real phone as Reception: the card shown on a second phone is scanned, Valid with name, ID, tier, valid until, date of birth and discounts, the identity choice is logged; the suspended member shows "Not valid: Suspended" at Reception and "Not valid" on the public page; an ordinary phone camera shows only name, ID, tier and valid until; an unknown token shows "Member not found". UAT-8 step 2 passes.

---

### Slice 14 — Wellness+ reports

**Goal:** Users with the reports permission see active members per tier, new members, renewals, upgrades, downgrades, corporate versus individual, revenue and working lists, for a period, with a table view and a CSV export. Every figure equals its definition in SRS §9.3.

**Requirements:** FR-RPT-01, 02, 03, 04, 05, 06, 07, 08, 09, 10 · FR-MEM-07 (expiring and review lists) · NFR-ACC-06 · NFR-PERF-05 · FR-AUD-16 (export) · FR-RBAC-27 (revenue field) · FR-DPR-02

**Depends on:** 5, 8, 10

**Spike at the start (D15):** confirm the MySQL version on the Hostinger host and pick `ROW_NUMBER()` or the correlated subquery for the monthly series.

**Backend** (`backend/src/membership/application/reports/`)
- `GetMembershipReportUseCase`: a period (the M3 presets, default This month, workspace week starts Monday) and filters tier, segment (corporate, individual), employer company, and the predefined Area and City of the employer company. It returns figures with `value`, `label`, `basis` (`period` or `asOfNow`) and `link`, using the formulas of `MembershipKpiDefinitions.ts` (Slice 1) and one reviewed SQL per figure group:
  - Active members and per tier (count and share), as of now from `currentTier`, and **at the end of each month** from the tier and status histories (FR-RPT-02, D15).
  - New members (corporate vs individual) and new paid memberships (payments kind New, not voided) (FR-RPT-03).
  - Renewals: terms ended in the period (paid, Silver and Gold, `endsOn + grace` in the period), renewed in time, not renewed, rate in total and per tier, a dash when none are due (FR-RPT-04).
  - Upgrades per path with count and amount (FR-RPT-05). Downgrades per path and reason from the tier history, corrections excluded (FR-RPT-06).
  - Corporate vs individual and the per-employer table (members, sponsored Silver, upgraded to paid, former employees, link) (FR-RPT-07).
  - Membership revenue per tier and kind by **date received**, voided excluded, **only with `members.payments.view`** and removed from the response otherwise (FR-RPT-08).
  - Working lists: expiring memberships (the same predicate as the badge), VIP reviews due, former employees to contact (FR-RPT-09).
- `GET /membership/reports/export.csv` per report with the same filters and scope, UTF-8 with BOM, formula-injection protection, contact details only for users with `members.view`, one audit entry with who, when and filters; opening a report is not audited (FR-RPT-10, FR-AUD-16).
- Open to `members.reports.view`; the CEO has it by default, Reception and Sales roles get 403.

**Frontend**
- A **Wellness+ reports** page: period selector (reuse `PeriodSelector`), filters (tier, segment, employer, Area and City from predefined lists), tiles with "as of now" or period labels, charts with a table view (reuse `ChartWithTable`), the working lists with links to the member, and export buttons. `membershipReports.json` (sq/en). Added to `mobile360.spec.ts`.

**Tests**
- `FR-RPT-01`: the location filter accepts only predefined ids; changing the period changes period figures and not "as of now" figures.
- `FR-RPT-02`: the counts per tier add up to the active members; the monthly series matches the tier history on a fixture with a suspension.
- `FR-RPT-03`: an upload of 40 employees adds 40 corporate members and no paid membership.
- `FR-RPT-04`, `NFR-ACC-06`: the worked example gives 15 due, 10 renewed, 66.67%; a downgrade Silver term is not in "Renewals due" (D5); a renewal paid within the grace days counts as renewed.
- `FR-RPT-05`: two Silver to Gold upgrades at €40.00 show count 2 and €80.00.
- `FR-RPT-06`: three Silver to Bronze and two Gold to Silver not renewed show 5 with the reason; a Correction is not counted.
- `FR-RPT-07`: the company table adds up to the corporate total.
- `FR-RPT-08`: March 2027 revenue is €1,140.00 (17 payments); a voided payment is excluded; a user without `members.payments.view` gets no revenue field.
- `FR-RPT-09`: "Expiring memberships" lists exactly the members with the Expiring soon badge.
- `FR-RPT-10`: the CSV equals the table; one audit entry; opening the report creates none; a name beginning with `=` opens as text; contact details only with `members.view`.
- `NFR-ACC-06`: a table-driven test per §9.3 figure on a fixed fixture; the seed's figures equal it.
- `NFR-PERF-05`: under 2 s at 50,000 members and 20,000 payments.
- A Reception and a Sales User call get 403.

**Done when:** UAT-9 steps 1 and 4 pass locally: the reports match the seed data and the lists behind them, the worked example gives €1,140.00 and 66.67%, and the export has an audit entry.

---

### Slice 15 — CEO dashboard Wellness+ block

**Goal:** The CEO dashboard shows the Wellness+ block that Milestone 3 reserved, with the same numbers as the reports and the same period and "as of now" rules.

**Requirements:** FR-DSH-14, 15, 16 · FR-RBAC-29 · FR-RBAC-27 (dashboard fields) · NFR-ACC-06 · NFR-PERF-05

**Depends on:** 14

**Backend**
- `GetCeoDashboardUseCase` (M3 Slice 14): replace the empty `wellnessPlus: []` slot with the block built by `GetMembershipReportUseCase` for All scope: active members and per tier, corporate vs individual, new members, new paid memberships, upgrades, downgrades, renewal rate, expiring memberships, and revenue (only with `members.payments.view`). **It calls the same use case and formulas as the reports page**, so the numbers cannot differ (FR-DSH-14).
- The block is present only for users with `members.reports.view`; for others the key is **absent from the response** with no Wellness+ field (FR-DSH-16). Money is removed without `members.payments.view` (FR-DSH-15). The other dashboards and Reception's landing page are unchanged.
- Links open the Wellness+ report or list already filtered (FR-DSH-15, M3 FR-DSH-05).

**Frontend**
- `CeoDashboard.tsx`: render the block on the M3 components (`KpiTile`, `ChartWithTable`, `EmptyState`), with the period selector, "as of now" labels and links. The block is not rendered when the key is absent. Added to the existing `mobile360.spec.ts` entry.

**Tests**
- `FR-DSH-14`: every number equals the same number on the reports page for All, on the seed data.
- `FR-DSH-15`: changing the period from month to year changes Upgrades but not Active members; money is absent for a role without `members.payments.view`.
- `FR-DSH-16`: a role without `members.reports.view` gets a dashboard with no Wellness+ block and no Wellness+ field; the Administrator, Sales and Reception dashboards are unchanged (snapshot of the M3 responses).
- `FR-RBAC-29`: the CEO gets 403 on every member, payment, import and settings write.
- `NFR-ACC-06`: the block's figures equal the fixture.
- Volume test at the NFR-PERF-05 size.

**Done when:** UAT-9 step 2 passes locally: the CEO dashboard's Wellness+ block equals the report, period figures change with the period and "as of now" figures do not.

---

### Slice 16 — Data protection: anonymise, export, retention

**Goal:** The Administrator can export what is held about a member and anonymise a member on request. Closed members can be anonymised automatically after a retention period, when the setting is switched on.

**Requirements:** FR-DPR-04, 05, 06 · FR-DPR-01, 03 (verified) · FR-AUD-14 (anonymise, export) · NFR-PRV-01 · Q18

**Depends on:** 4, 11

**Data**
- `MembershipSettings.retentionMonths Int?` (null = off) and `MembershipSettings.autoAnonymiseEnabled Boolean default false` (D18).

**Backend**
- `ExportMemberDataUseCase` (`wellnessplus.settings.manage`, D16): one JSON or CSV file with every field held about the member, the terms, payments, histories and verification events; audited (who, when, member id; no personal values in the audit entry).
- `AnonymiseMemberUseCase` (`wellnessplus.settings.manage`): removes name, date of birth, phone, email and note; replaces the name with "Removed member"; sets the card token to a new random value that is **not stored anywhere** and sets `anonymisedAt`, so the old link answers "Card not found"; sets the status Closed; **keeps the member number, payments, receipt numbers and tier history** with no link to a person, so revenue figures do not change; removes the employer-linked verification IP data only if present (hashes stay). Clears any `EmployeeImport` row still holding that person. Audited without personal values (FR-DPR-04). A closed anonymised member cannot be reopened.
- `AnonymiseClosedMembersJob` on `runDailyJob` (Could, D18): when enabled, anonymises members closed longer than `retentionMonths`; idempotent and catch-up safe.
- Verification of FR-DPR-06: a test that the card and verification URLs contain only the token and no personal data; a response header test (HTTPS, `Strict-Transport-Security` as already set); the hosting location note is added to `deploy/hosting-and-data-protection.md`.

**Frontend**
- Member page (Administrator): **Export data** and **Anonymise** with a typed confirmation. The anonymised member shows "Removed member". The retention setting is added to the Wellness+ settings page (off by default).

**Tests**
- `FR-DPR-04`: after anonymising, the member shows "Removed member", the card link shows "Card not found", the status is Closed, the revenue figures and receipts are unchanged (report before and after), the audit entry has no personal value; a user without the permission gets 403; the export contains the member's data and an audit entry exists.
- `FR-DPR-05`: a member closed longer than the period is anonymised by the job when enabled; nothing happens when disabled; a second run changes nothing.
- `FR-DPR-01`, `FR-DPR-03` (schema test): the `Member` columns have no medical, national-ID, address or photo field.
- `FR-DPR-06`: card and verification URLs contain only the token.
- `NFR-PRV-01`: the data-model review note exists in the release notes.

**Done when:** UAT-9 step 5 passes locally: the anonymised member shows "Removed member", the card link no longer works and revenue is unchanged.

---

### Slice 17 — Milestone hardening & UAT readiness

**Goal:** Staging is ready for Wellness Albania to run UAT-1 to UAT-10 with one user per role plus a Membership Agent, on real phones, with Phase 1 and Phase 2 end to end.

**Requirements:** NFR-SEC-07, 08, 09 (review) · NFR-PERF-05 · NFR-USE-04 · NFR-I18N-04 · NFR-MNT-04 (verified) · NFR-OPS-04, 05 (rehearsal) · NFR-REL-02 (verified) · NFR-DAT-02 (verified) · NFR-ACC-05, 06 (verified) · FR-RBAC-25..30 (verified) · FR-AUD-14, 15, 16 (verified) · FR-DPR-01..06 (verified) · all UATs

**Depends on:** all

**Work**
- The generated permission matrix and route coverage tests pass with every M4 route. The only exemptions are the card, manifest, service worker and public verification routes, each documented (FR-RBAC-30). An integration test calls every Wellness+ endpoint for each role and gets the right refusal.
- Run `/security-review` on the milestone diff. Write `deploy/security-review-m4.md` in the M3 format:
  - Findings, fixes and accepted risks.
  - **Card tokens:** CSPRNG, length, uniqueness, **not in logs, audit, error reports, notifications or referrers** (`Referrer-Policy: no-referrer` on card pages), uniform not-found, rate limits (60 and 300 per hour), no analytics. Accepted risk to record: the current token is stored readable so staff can copy links (D11).
  - **Public pages:** the exact response key sets, no existence leak between suspended, closed and unknown, `noindex`, `no-store`.
  - **Service worker:** scope limited to `/m/`, never caching staff routes or API responses, cache cleared on replace.
  - **Employee upload:** magic-byte and container checks, macro refusal, formula handling, zip-bomb and size limits, 24-hour deletion of the parsed rows.
  - **Redaction** against every new response, especially Reception, `members.verify`-only, `members.view` without payments, and the dashboard.
  - **Privacy:** no medical data, minimal fields, anonymisation, MedWork sees membership and commercial data only (FR-DPR-02); the EU hosting note.
  - Revisit the accepted risk from M1–M3 "field redaction checks whether the permission is held, not its scope": members have no scope, so record that it does not apply here.
- Extend `backend/scripts/uat/seedUat.ts` (tested by `seedUat.test.ts`) per SRS §12.1:
  - The **Membership Agent** preset role and test user (D17).
  - Members in every tier and status; the M3 UAT-1 company with a valid contract and employees as sponsored Silver; a company whose contract is ending for UAT-2; family groups (Gold principal, Bronze principal); payments in every kind including a voided one; a Gold and a paid Silver term that ended **yesterday**; a VIP; memberships expiring in **20 days**; former employees.
  - The March 2027 fixture of SRS §9.3 so the worked example (€1,140.00, 66.67%, 5 downgrades) is reproducible.
  - `--members 50000 --payments 20000` for the performance check.
  - A sample employee `.xlsx` for UAT-1 (2 new, 1 existing, 1 repeated, 1 without last name) and a macro file for the refusal.
- Measure on staging with `measure-performance.ts`: the member list and search, Reception and public verification (under 1 s), the card page (under 2 s on a mid-range phone on 4G, throttled in the test), the 1,000-row preview (under 15 s) and confirm (under 30 s), reports and the dashboard block (under 2 s) at the NFR-PERF-05 volumes. Add or adjust indexes if one misses.
- Run the job tests (twice, two-day gap, failing notification) for `MemberTermJob` and the sponsor sync on the staging clock (NFR-REL-02), and a concurrency test for member numbers, receipt numbers and VIP requests (NFR-DAT-02).
- **Device pass.** Real iPhone (Safari) and real Android (Chrome): card open, add to home screen, offline, language, QR scan at 30% brightness in dark mode (NFR-USE-05), camera permission, replaced link. Chrome desktop and the 360 px suite for every staff screen. The signed device checklist goes into `deploy/uat-milestone-4.md`. The `e2e-mobile` job is green with the screens added in Slices 3–15.
- `npm run check:translations`; tier, benefit, notification and card labels in sq and en (el and it for the card where supplied); number and date formats in both languages (NFR-I18N-04).
- `node scripts/check-traceability.mjs --list`: every M4 Must ID is named in a test, and the Should and Could warnings are reviewed (NFR-MNT-04).
- Migration rehearsal on a production copy (NFR-OPS-04): backup, the new tables and seeds, the nine permissions through the upgrade ledger with customised roles untouched, `mysql_upgrade_to_current.sql` twice, `prisma migrate diff` shows no difference.
- Hosting: set `PUBLIC_BASE_URL` for staging and production, confirm HTTPS, document the redirect from any previous address, and decide **before any card is issued** that the production address is final (NFR-OPS-05, Q19).
- Re-run Milestone 1 UAT-1..6, Milestone 2 UAT-1..6 and Milestone 3 UAT-1..7 against the M4 build (UAT-10 step 4), including Reception seeing no sales or payment data.
- Write `deploy/uat-milestone-4.md` in the format of `deploy/uat-milestone-3.md`: preparation, pre-flight checklist, UAT-1..10 with the seeded user per step, the real-device checklist, and a sign-off table.
- Replace placeholder seeds with Wellness Albania's real inputs if they have arrived (section 5): benefit percentages, fees, staff and approvers, the sample employee list, card design and privacy text, the public address, partner clinic list, retention period.

**Done when:** UAT-1 to UAT-10 pass on staging, run by the team including the phone steps, and the milestone is handed to Wellness Albania for sign-off.

---

## 5. Inputs needed from Wellness Albania, by slice

| Input (SRS §12.3) | Needed by | If late |
|---|---|---|
| Final discount percentage per service and per tier, including VIP, and the final service list (Q8) | Slice 3, 11, 13 | SRS §6.1 seed, VIP equal to Gold |
| Confirmation of fees (€60, €100), term lengths and the family discount (50%) (Q6, Q7) | Slice 3, 5, 6 | Proposed defaults |
| Downgrade rule: one step with a new 12-month term (Q4) and grace days (Q5) | Slice 1, 8 | One step, 12 months, 0 grace days |
| Names and roles of the Wellness+ staff, and who approves VIP (Q1, Q2) | Slice 2, 7, 17 | Administrator approves; the agent role is built from the roles screen; staging uses the seeded Membership Agent |
| VIP review period and what happens at the end (Q3) | Slice 7, 8 | 12 months; falls back to the highest other tier |
| Paying while holding a downgrade or sponsored Silver term (D5), and an existing paying member in an upload (Q10) | Slice 1, 5, 9 | D5 as assumed; the paid term continues and the higher tier wins |
| A sample employee list from a client company with real column names (Q9) | Slice 9 | The template of FR-EMP-02 and a generated test file |
| A person linked to two companies, and what happens when a contract is suspended or there is a gap (Q11, Q12, Q13) | Slice 9, 10 | One company at a time; Bronze while suspended; Silver again after |
| How card links reach members (Q14) | Slice 9, 11 | Staff copy, print or download the sheet; no email |
| The card design: logo, colours, tier colours, privacy line and install instructions text | Slice 11, 12 | The Wellness+ brand from Milestone 1 and neutral texts |
| Greek and Italian card texts (Q19) | Slice 11 | English fallback |
| The final public web address for card links (Q19) | Slice 11, 12, 17 | Staging address; **must be fixed before the first real card is issued** |
| Whether partner clinics must be registered and what they may see (Q15) | Slice 13 | Anonymous scan; name, ID, tier and valid-until only |
| When the paid year starts (Q16) and whether a printed receipt is needed (Q17) | Slice 1, 5 | On the payment date; PDF receipt, not an invoice |
| Data retention period and the data processing terms with MedWork (Q18) | Slice 16 | Automatic anonymisation off |
| Answers to Q1–Q19 | Slices 1–16 | Proposed defaults, D20 |

---

## 6. Traceability: requirement → slice

Together, the slices cover every requirement and UAT scenario in the Milestone 4 SRS. Where a requirement is split, the first slice listed adds its ID to `scripts/srs-requirements.json` (rule 1).

| Requirement | Slice(s) |
|---|---|
| FR-MEM-01, 02, 04, 05, 07, 08, 09, 10 | 4 |
| FR-MEM-03 | 3 (prefix setting), 4 (numbering) |
| FR-MEM-06 | 1 (rule), 4 (API), 13 (verification) |
| FR-MEM-11 | 10 |
| FR-TIR-01 | 3 (settings), 5 (applies to new payments) |
| FR-TIR-02 | 1 (rule), 4 (member page), 10 (sponsored) |
| FR-TIR-03, 04 | 1 (rules), 5 (use cases) |
| FR-TIR-05 | 1 (rule), 3 (setting), 8 (job) |
| FR-TIR-06, 07 | 1 (rule), 8 (job) |
| FR-TIR-08 | 4 (table), 5, 7, 8, 9, 10 (reasons) |
| FR-TIR-09 | 8 |
| FR-TIR-10 | 1 (rule), 3 (setting), 8 (badge), 14 (list) |
| FR-TIR-11 | 8 |
| FR-MPAY-01, 05, 06, 07, 08, 10, 11 | 5 |
| FR-MPAY-02, 03, 04 | 1 (rule), 5 (use case) |
| FR-MPAY-09 | 5 (rule), 9 (upload test) |
| FR-VIP-01, 02, 05 | 7 |
| FR-VIP-03 | 1 (dates), 7 (approval) |
| FR-VIP-04 | 7 (approval, filter), 8 (notice, fall-back) |
| FR-EMP-01, 02, 03, 04, 05, 06, 07, 14 | 9 |
| FR-EMP-08 | 11 |
| FR-EMP-09 | 1 (sponsor end), 10 |
| FR-EMP-10, 11, 12, 13, 15 | 10 |
| FR-FAM-01, 03, 05, 06, 07, 08 | 6 |
| FR-FAM-02 | 3 (list), 6 (use) |
| FR-FAM-04 | 1 (rule), 3 (setting), 6 (payment) |
| FR-BEN-01, 02, 05, 06 | 3 |
| FR-BEN-03 | 11 (card), 13 (verification) |
| FR-BEN-04 | 3 (read only), 13 (Reception screen) |
| FR-CRD-01, 02, 03, 04, 08, 09, 10, 12 | 11 |
| FR-CRD-05, 06, 07 | 12 |
| FR-CRD-11 | not built (D18, Could, Q14) |
| FR-VER-01..10 | 13 |
| FR-RPT-01..10 | 14 |
| FR-DSH-14, 15, 16 | 15 |
| FR-DPR-01, 03 | 4 (schema), verified in 16, 17 |
| FR-DPR-02 | 2 |
| FR-DPR-04, 05, 06 | 16 |
| FR-RBAC-25, 26, 28, 29 | 2 (28 enforced in 4) |
| FR-RBAC-27 | 2 (lists), 4, 5, 13 (shapes), 14, 15 |
| FR-RBAC-30 | 2 (exemption mechanism), 11, 13, 17 (verified) |
| FR-AUD-14 | 3 (settings), 4, 5, 6, 7, 9, 10, 11, 16 |
| FR-AUD-15 | 2 (group), registered by 3, 4, 5 |
| FR-AUD-16 | 5 (export), 11 (links), 14 (reports) |
| NFR-ACC-05 | 1 (domain), 5 (schema and payments) |
| NFR-ACC-06 | 1 (formulas), 14 (reports), 15 (block) |
| NFR-SEC-07 | 4, 11, 13; verified in 17 |
| NFR-SEC-08 | 11 (card), 13 (verification); verified in 17 |
| NFR-SEC-09 | 9; verified in 17 |
| NFR-PRV-01 | 4 (schema), 16; verified in 17 |
| NFR-REL-02 | 8, 10; verified in 17 |
| NFR-DAT-02 | 3 (benefit), 4 (number, token), 5 (receipt), 6 (principal), 7 (VIP), 8 (term), 9 (employer) |
| NFR-PERF-05 | 4, 9, 13, 14, 15; measured in 17 |
| NFR-USE-04 | every slice (rule 8); 12, 13 on real devices; verified in 17 |
| NFR-USE-05 | 11; verified in 12, 17 |
| NFR-I18N-04 | every slice (rule 8); verified in 17 |
| NFR-MNT-04 | every slice (rule 1); verified in 17 |
| NFR-OPS-04 | 2, 3, 4; rehearsed in 17 |
| NFR-OPS-05 | 3 (setting), 11 (links), 12; rehearsed in 17 |
| UAT-1 Employee upload | 9 |
| UAT-2 Contract and employee tier | 10 |
| UAT-3 Payments, upgrade and family | 4, 5, 6 |
| UAT-4 Expiry and downgrade | 8 |
| UAT-5 VIP | 7, 8 |
| UAT-6 Card on a phone | 11, 12 |
| UAT-7 Verification | 13 |
| UAT-8 Benefit table | 3, 13 |
| UAT-9 Reports, dashboard and data protection | 14, 15, 16 |
| UAT-10 Phase 1 to Phase 2 end to end | 17 |
