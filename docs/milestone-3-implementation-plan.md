# Wellness Albania Platform — Milestone 3 Implementation Plan (slice-based)

| Item | Value |
|---|---|
| Source | `Wellness Platform - Milestone 3 SRS.docx` v0.1 (04.10.2026), `milestone-1-implementation-plan.md`, `milestone-2-implementation-plan.md` |
| Scope | Milestone 3: Contracts, Payments & Dashboards (completes Phase 1) |
| Builds on | Milestone 2, as implemented on branch `m2-slice-14-hardening` |
| Approach | Vertical slices. Each slice is one branch (`m3-slice-N-<name>`) and one PR, with its own schema change, backend, frontend, translations and tests. At the end of each slice, something works that Wellness Albania can see or that a test proves. |
| Date | 04.10.2026 |

---

## 1. How to read this plan

Milestone 3 is split into **15 slices**. Together they cover every Must, Should and Could requirement in the SRS. Section 6 maps each requirement to its slice, and when a requirement is split across slices, the split is stated there and in each slice. Each slice lists:

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
| 1 | Contract & payment domain rules (money, transitions, validity, schedule) | M | — | — (proves NFR-ACC-03) |
| 2 | Contract & payment permissions, role upgrade, redaction list | M | — | UAT-4 (partial) |
| 3 | Contract settings (reminders, expiring-soon, grace days, number prefix) | S | 2 | — |
| 4 | Contract from a won deal (schema, Decimal conversion, list, record) | L | 1, 2, 3 | UAT-1 steps 1–2 |
| 5 | Contract lifecycle & signed document | L | 4 | **UAT-1**, UAT-4 (suspend) |
| 6 | Validity & Reception view | M | 4 | **UAT-4** |
| 7 | Expiry job & company status | M | 5 | UAT-7 step 3 |
| 8 | Instalments: invoices, receipts, history | L | 5 | **UAT-2** |
| 9 | Overdue job, Payments overview, notifications & CSV | L | 3, 8 | **UAT-3** |
| 10 | Renewal deal & renewal contract | M | 5 | UAT-7 step 2 |
| 11 | Renewal reminders, Renewals screen & calendar items | L | 3, 7, 10 | **UAT-7** (steps 1–3) |
| 12 | KPI engine & Performance screen | L | 2 | **UAT-6** |
| 13 | Dashboard framework, Sales User & Sales Manager dashboards | L | 12 | UAT-5 (partial) |
| 14 | Administrator & CEO dashboards | M | 7, 9, 13 | **UAT-5** |
| 15 | Milestone hardening & UAT readiness | M | all | **UAT-1..7 on staging** |

### 1.2 Dependency graph and parallel tracks

```
1 Domain rules ─┐
2 Permissions ──┼──► 4 Contract from deal ──► 5 Lifecycle & document ──┬──► 7 Expiry job ──┐
3 Settings ─────┘          │                                           │                   │
                           └──► 6 Validity & Reception                 ├──► 8 Instalments ─┼─► 9 Overdue & overview
                                                                       │                   │
                                                                       └──► 10 Renewal deal┴─► 11 Reminders & Renewals
2 Permissions ──► 12 KPI engine & Performance ──► 13 Dashboards (Sales User, Manager) ──► 14 Admin & CEO dashboards
                                                                                               ▲ (needs 7, 9)
                                                                                               ▼
                                                                                    15 Hardening
```

With two developers, a workable split is:

- **Track A (contracts):** 1 → 3 → 4 → 5 → 7 → 10 → 11
- **Track B (money and analytics):** 2 → 12 → 13, then 6 → 8 → 9 → 14 once Track A merges 5
- **Both:** 15

Slice 2 is small and first on Track B, because Slices 3 and 4 need its permission keys. Track A must merge Slice 5 before Track B can start Slice 8, so Slices 12 and 13 are placed first on Track B to keep it busy. Slice 14 needs Slices 7 and 9 (contract and payment figures), so it closes the milestone's feature work. Slice 12 and Slice 13 do not touch contracts or payments and can start at any time after Slice 2.

---

## 2. Cross-cutting rules (every slice)

The nine M1 rules and the nine M2 rules (M2 plan §2) still apply: TDD with the requirement ID in the test title, Clean Architecture, two schemas, tenant isolation, translations, audit in the same transaction, permissions instead of role names, 360 px, `Tenant.salesWorkflow` guard, tenant-aware jobs, commercial redaction, matrix coverage and `Money` for money. Milestone 3 adds:

1. **Requirement IDs at slice start (NFR-MNT-03).** The first commit of each slice adds that slice's IDs, and only those, to `scripts/srs-requirements.json`, with priority and requirement text copied from the M3 SRS. Update the file's `source` note to name all three SRSs. When a requirement is split, the **first** slice that touches it adds it and names it in a test title.
2. **Contract and payment money is Decimal (NFR-ACC-03).** Slices 1 and 4 move `Contract.amount` and `ContractPayment.amount/paidAmount` from `Float` to `Decimal(12,2)`. After Slice 4 no `Float` remains in the contract and payment tables, and the schema test from M2 (no `Float` in M2 models) is extended to the M3 models. The API sends money as strings; the frontend formats and never calculates. Dashboards and the performance screen sum in the database as `Decimal` and format in the presentation layer, never with JavaScript `number` arithmetic.
3. **Every new field is redacted.** New contract fields go through `presentContract.ts`, the one place that decides what each role receives (FR-RBAC-21). New payment, deal-value and KPI value field names are added to `GUARDED_FIELDS` in `backend/src/access/domain/redactFields.ts` (under `commercial.view`, or under `payments.view` for payment fields) in the same slice that adds them, with a test next to it. A Reception test runs against every new response (NFR-SEC-06).
4. **Business rules live in the domain.** The transition table, `Contract.validityOn`, the payment status rules, the schedule and every KPI formula are pure domain functions with table-driven tests. Controllers, SQL fragments and the frontend never repeat them. The frontend shows what the server returned (SRS §2.4).
5. **Jobs follow one pattern (NFR-REL-01).** Every new daily job (payment overdue, renewal reminders) and the existing `ContractExpiryJob` use the shared helper from Slice 7: iterate tenants, compute "today" with `tenantDay(tenant.timezone)`, record the actor as `null` ("system"), select by state (not by "yesterday"), so a two-day gap catches up, and write the notification after the state change in an idempotent way. Each job has the same three tests: twice in a row, after a two-day gap, and with a failing notification.
6. **New routes join the matrix.** Every route declares its permission with `requirePermission` / `requireScope`, so `permissionMatrix.test.ts` and `routeCoverage.test.ts` cover it against `DEFAULT_ROLE_MATRIX` (NFR-SEC-04). Dashboard and performance routes read their scope from the access context, never from a request parameter (FR-RBAC-23).
7. **Audit.** Contract and instalment actions use the existing `Contract` and `ContractPayment` audit types (registered in `AUDITED_ENTITY_TYPES`). The new `ContractSettings` type is added in Slice 3. Every audited write uses the module's write-transaction port (`PrismaContractWriteTransaction.ts`), with the audit entry inside the same transaction (FR-AUD-11).
8. **Mobile and translations.** Every new screen is added to the `screens` list in `frontend/tests/e2e/mobile360.spec.ts` in the slice that builds it (NFR-USE-03). Every new string, notification type, status label and chart label exists in `sq` and `en`, and `npm run check:translations` passes (NFR-I18N-03).
9. **Out of scope.** No Wellness+ (Milestone 4), no payment gateway, no invoice issuing, no contract template generation, no automatic renewal, no sales targets, no e-signature or email of contracts (SRS §1.2). The CEO dashboard only leaves an empty slot for Wellness+ indicators.

---

## 3. Decisions this plan takes (confirm or override)

The SRS leaves these open or asks the plan to decide. The plan assumes the answers below so that work can start. Changing an answer only changes the slices named.

| # | Decision | Assumed answer | Affects |
|---|---|---|---|
| D1 | Extend `Contract` or add a new entity | **Extend `Contract` in place** (SRS §3 developer note). New columns are nullable except where the migration can backfill. `dealId` is `@unique` and nullable; a row with `dealId = null` is **Legacy: no deal** and stays readable and editable only through the old generic paths. **Guard:** the "contract needs a won deal" rule (FR-CON-02) applies when `Tenant.salesWorkflow = SALES_PROCESS`. Other workspaces keep the manual create and `RenewContractUseCase`. **Why:** the generic workspaces still use the same table, and a second entity would split the company timeline, the expiry job and the list. | 4, 5, 10 |
| D2 | Float → Decimal for existing rows | **One migration per database** (Postgres migration; MySQL script folded into `mysql_upgrade_to_current.sql`). `amount` and `paidAmount` become `Decimal(12,2)` with `ROUND(x, 2)`. The migration first writes a report of rows where `ABS(x - ROUND(x,2)) >= 0.005`, which must be empty or reviewed (NFR-OPS-03). `ContractPayment.status` default becomes `NOT_INVOICED`; **no existing row changes status**. Existing contracts get `dealId = null`, and `agreedAnnualValue` is **not** invented for them: it stays null and the record shows the Legacy label. A backup is taken first. | 4 |
| D3 | Contract numbers | **Reuse `DocumentSequence` with `kind = CONTRACT`** (M2 D5), incremented under a row lock in the create transaction, per tenant and year. Prefix `CTR` is a setting (`ContractSettings.numberPrefix`, Slice 3). Existing contracts are **not** renumbered: the old UUID-based reference (`contractReference.ts`, TD-021) stays as the Legacy reference. | 3, 4 |
| D4 | Contract term and end date | `endsAt = addMonths(startsAt, contractMonths) − 1 day` in the workspace time zone, clamped to the last day of a shorter month before subtracting the day. 1 March 2027 + 12 months → 29 February 2028 (FR-CON-03). Contract months come from the offer's `ruleSnapshot` (M2 D2). Q1: editable while Draft. Dates are stored as a date at workspace-time midnight and compared as workspace dates (`tenantDay`), never as UTC instants. | 1, 4 |
| D5 | Instalment amount for non-monthly billing | The agreed monthly price × months in the period (quarterly = 3 × monthly, annual = 12 ×, one-time = annual value for the term). Each instalment stores its own amount. The schedule function returns the amounts, and the last instalment takes any rounding remainder so the total equals the contract value to the cent. SRS FR-PAY-02 says "the contract price for one period"; this is the same thing stated for non-monthly periods. Q2 default (monthly) is unchanged. | 1, 5 |
| D6 | Receipts and corrections | **Every receipt is one `ContractPaymentHistory` row** (amount received in that change, user, date, method, comment). `ContractPayment.paidAmount` is the running total and `paidAt` is the date of the last receipt. There is **no separate receipts table**: history is the receipt list. A correction "back to an earlier status" (FR-PAY-06) that would drop received money is done as an explicit **reverse receipt** action (amount, comment required), which writes a negative history row. Status is then derived again from the amounts. Choosing Paid or Partially Paid by hand is never offered. | 8 |
| D7 | Overdue and Partially Paid | Per the SRS table, a past-due Partially Paid instalment becomes Overdue, and a further receipt moves it back to Partially Paid or Paid. The job would then flag the partly paid instalment Overdue again the next day. **Plan:** each run records a history row only when the status really changes, the overdue **notification is sent once per instalment** (`overdueNotifiedAt`, FR-PAY-13), and the overview shows outstanding from amounts, so the label flip never changes a number. Wellness Albania to confirm that a partly paid, past-due instalment should read Overdue. | 9 |
| D8 | Reminder catch-up rule (FR-REN-01, FR-REN-03, NFR-REL-01) | One `ContractReminder (contractId, leadDays)` row per lead time, with a `state` (`SENT` or `SKIPPED`). On each run, for a contract whose `daysLeft ≤ leadDays`, the **smallest reached lead time not yet recorded is sent**, and every larger unrecorded one is recorded `SKIPPED`. A contract with 25 days left on first run gets the 30-day reminder, and the 60-day one is recorded as skipped; the 7-day one goes out later (UAT-7). A failed send writes no row, so the next run retries (FR-REN-03). The SRS data model lists only `sentAt`; the plan adds `state` so that "skipped" is distinguishable from "sent". Changing the lead times affects only contracts without a row at that lead time (FR-REN-01). | 11 |
| D9 | Renewal state on the Renewals screen | Derived, never stored, in this order: **Not renewing** (`notRenewingReasonId` set) → **Renewed** (`renewedInto` exists) → **In negotiation** (an open Renewal deal with `renewalOfContractId` = this contract) → **Not started**. One open renewal deal per contract is enforced by a partial unique rule in the use case and a unique index on `(renewalOfContractId)` for open deals where the database allows it (PostgreSQL partial index; on MySQL the use case checks inside the transaction). | 10, 11 |
| D10 | Dashboard and performance as read models | **One application query per dashboard** in a new `backend/src/dashboard/application/wellness/` folder, each taking the access context (user, role, scope) and a period, returning figures with `value`, `label`, `basis` (`period` or `asOfNow`) and `link`. KPI formulas (conversion rate, average time to close, total rows, pipeline value, outstanding) are pure functions in `backend/src/dashboard/domain/KpiDefinitions.ts`; counts and sums come from Prisma `groupBy` / `aggregate` or one reviewed raw SQL per KPI group, so both databases give the same numbers. The existing `GetTenantClientMetricsUseCase` and the Staff / Business Owner / Super Admin pages are not changed. | 12, 13, 14 |
| D11 | Which dashboard a user gets | The server decides: `GET /dashboard/home` returns `{ kind: SALES_USER \| SALES_MANAGER \| ADMINISTRATOR \| CEO \| NONE }` from the user's **role base key** (M1 `role base key` migration), so a copied role gets the dashboard of the role it was copied from. A role with no base key, and Reception, gets `NONE` and lands on the company search (FR-DSH-01). Which figures inside it are shown still depends on the user's permissions (FR-DSH-08). | 13 |
| D12 | Scope "Team" and the Sales Manager | Team means the sales team: companies and deals whose responsible user holds the Sales User role (by base key), never other roles (Dimitris, FR-RBAC-22). It is resolved by the existing `RecordScopeResolver` and `ownerWhere`; Slice 4 adds a test that an Administrator-owned company is not in the Sales Manager's team. | 4, 12, 13 |
| D13 | Stage history owner (FR-PRF-05) | Add `DealStageHistory.ownerUserId` (nullable). The migration backfills rows from the deal's current owner (SRS §6 note). `Deal.reassign` and every stage change write the owner **at that time**. Won and lost attribution reads the owner from the `WON` / `LOST` history row, so reassigning a deal later does not move its result. | 12 |
| D14 | Contract documents | New `ContractDocument` table (versions, `isCurrent`) replaces `Contract.documentUrl/documentName` as the source of truth. The two old columns are filled from the current document for generic workspaces, and an existing document is copied into one `ContractDocument` row by the migration. The file store stays `ContractDocumentStore.ts` (PDF only, 15 MB, magic bytes). Download goes through an authorised endpoint, never a public `/uploads` URL, for `SALES_PROCESS` workspaces. | 5 |
| D15 | Cancelling and "future" instalments (FR-CON-15) | On cancel, instalments with status `NOT_INVOICED` and `dueDate` after the workspace "today" are removed. A `NOT_INVOICED` instalment already due stays, flagged "Due, not invoiced", for an authorised user to settle. Everything invoiced, partly paid or paid stays. Removal is audited per instalment. Example from the SRS (3 paid, 1 invoiced, 8 future) leaves 4. | 5 |
| D16 | Open questions Q1–Q16 | Build on the SRS's proposed default. The slice each question affects is named in that slice. Q1, Q2 → **4, 5**; Q3, Q4 → **2, 8**; Q5 → **5**; Q6, Q7 → **3, 11**; Q8 → **10**; Q9 (extra services = separate contract) → **4**; Q10, Q11, Q14 → **12, 13, 14**; Q12, Q13 → **9**; Q15 → no targets; Q16 → **7**. |
| D17 | Permission for the settings and status labels | The matrix row "Reminder, expiring-soon and payment settings; contract and payment status labels: manage" uses the existing `settings.manage` (Administrator). No new key. Renewals: "start a renewal deal" uses `contracts.manage` plus `deals.edit`; no separate catalogue key is added, because the SRS matrix row (§7.2) assigns the same default as contract management and FR-RBAC-19 adds only `contracts.terminate`. Confirm if a separate key is wanted. | 2, 10 |

---

## 4. The slices

### Slice 1 — Contract & payment domain rules

**Goal:** Pure domain code decides every contract and instalment rule the rest of the milestone depends on: the status transition table, validity, the contract dates, the payment schedule, receipts, the payment status rules and the overdue rule. No database, no screen. Tests prove the numbers in the SRS.

**Requirements:** NFR-ACC-03 (domain part) · FR-CON-03 (dates, price, annual value) · FR-CON-07 (renewal date) · FR-CON-11 (transition table) · FR-CON-20 (validity rule) · FR-REN-04 (expiring-soon rule) · FR-PAY-02 (schedule) · FR-PAY-06 (status rules) · FR-PAY-07 (receipts) · FR-PAY-09 (overdue rule) · FR-PAY-10 (summary)

**Depends on:** —

**Backend** (all under `backend/src/contracts/domain/`, reusing `Money` and `Percent` from M2 Slice 1)
- `Contract.ts`: add `ContractTransition` table (§3.2 of the SRS: from, to, required permission key, whether a reason is required) and `canTransition(from, to)`. `Contract.validityOn(today, expiringSoonDays)` returns `{ valid, reason: NOT_STARTED | DRAFT | PENDING_SIGNATURE | SUSPENDED | EXPIRED | CANCELLED | null, expiringSoon, daysLeft }`. Both end and start days are included.
- `contractTerm.ts`: `defaultEndDate(start, months)` (D4), `defaultRenewalDate(end, leadDays[])` (FR-CON-07).
- `paymentSchedule.ts` (exists): rewrite on `Money`. Input: start, end, billing period, monthly price. Output: due date and amount per instalment, first on the start date, same day each period, clamped to the last day of a shorter month, none after the end date, at most 120, total equal to the term value (D5).
- `ContractPayment.ts` (exists): `PaymentStatus` rules from §4.2. `recordReceipt(instalment, amount, receivedOn, method, today)` returns the new `paidAmount` and status, and refuses a future date, a zero or negative amount and an amount above the outstanding. `reverseReceipt`. `markInvoiced(number, date)`, `markPending()`, `correct(toStatus, comment)`. `outstanding()`. `overdueOn(today, graceDays)` returns true only for `INVOICE_ISSUED`, `PAYMENT_PENDING`, `PARTIALLY_PAID` past due plus grace; `dueNotInvoiced(today)` for `NOT_INVOICED`.
- `paymentSummary.ts`: `summarise(instalments, today)` → total, received, outstanding, next due date, overdue count and amount.

**Tests**
- `FR-CON-11`: table-driven, all 6 × 6 pairs; only the seven allowed transitions pass; Expired and Cancelled are final.
- `FR-CON-20`: starts tomorrow → `NOT_STARTED`; on the end date still valid; the day after is not; each status gives its reason.
- `FR-REN-04`: window 30 → 31 days left is Valid, 30 days left is Expiring soon.
- `FR-CON-03`: 1 March 2027 + 12 months → 29 February 2028; 31 January start; 12 months on a leap year; Example A price €49.40, annual €592.80.
- `FR-CON-07`: lead times 60, 30, 7 and end 29 February 2028 → 31 December 2027.
- `FR-PAY-02`: monthly = 12 instalments of €49.40; quarterly = 4 of €148.20; a 31 January start gives 28 February second due date; 120 cap; none after the end date; total equals contract value for all billing periods.
- `FR-PAY-07`: €49.40: receipt €20.00 → Partially Paid, €29.40 outstanding; €29.40 → Paid; €1.00 more refused; future date refused.
- `FR-PAY-06`: Paid and Partially Paid cannot be set directly; Invoice Issued needs number and date.
- `FR-PAY-09`: due yesterday + Payment Pending → overdue; Not Invoiced → flag only; grace days 3 moves the day; Paid never overdue.
- `FR-PAY-10`: 12 × €49.40 with 3 paid → total €592.80, received €148.20, outstanding €444.60.
- `NFR-ACC-03`: `it.each` over a table of amounts, periods and receipts; no float drift (`0.1 + 0.2`).

**Done when:** The domain tests pass in CI with no database. They are the reference every later slice uses.

---

### Slice 2 — Contract & payment permissions, role upgrade, redaction list

**Goal:** The roles screen shows "Contracts: suspend, cancel, reinstate" and the three activated M3 permissions. Every existing workspace receives the §7.2 defaults once, without losing customisation. The audit filter shows the Contract and Payment types.

**Requirements:** FR-RBAC-19, FR-RBAC-20 · FR-RBAC-21 (field lists and Reception test harness) · FR-AUD-12 (filter group) · NFR-SEC-04 (matrix expectations for the new key) · Q3

**Depends on:** —

**Data**
- Reuses the M2 `AppliedPermissionUpgrade (tenantId, key, appliedAt)` ledger. No new table.

**Backend**
- `PermissionCatalogue.ts`: add `contracts.terminate` (`group: 'contracts'`, scoped). Remove `milestone: 'M3'` from `payments.view`, `payments.update` and `performance.view`. Labels in `sq` and `en`.
- `DefaultRoleMatrix.ts`: take the §7.2 values:
  - `contracts.validity.view`: Sales User Own, Sales Manager Team, Reception All, Administrator All, CEO All.
  - `commercial.view` and `contracts.manage`: as M2 where present; `contracts.manage` stays off for the CEO and Reception.
  - `contracts.terminate`: Sales Manager Team, Administrator All.
  - `payments.view`: Sales User Own, Sales Manager Team, Administrator All, CEO All. `payments.update`: **Administrator only** (Q3).
  - `performance.view`: Sales User Own, Sales Manager Team, CEO All. **Not** the Administrator.
- `PermissionUpgrades.ts`: add `m3-contracts-payments` listing the keys new or activated in Milestone 3 and the default per system role. Same mechanism as `m2-sales` (D7 of M2): insert only missing keys, only into system roles, never update or delete, write one `Role` audit entry per changed role from the system actor, then the ledger row. SQL is generated by `generate-role-seed-sql.ts` in upgrade mode for the Postgres migration and the MySQL script; `PrismaSystemRoleSeeder.ts` seeds new tenants with the full matrix and writes the ledger row.
- `redactFields.ts`: add the Milestone 3 contract fields to the `commercial.view` list: `agreedMonthlyPrice, agreedAnnualValue, discountPercent, servicesSnapshot, packageId, packageName, termsText, quotationId, dealId, document, documents, renewalDate` (see Slice 4 for the final set) and the payment fields to a new `payments.view` list: `amount, paidAmount, outstanding, invoiceNumber, invoiceDate, method, paymentSummary, payments`. One exported constant per list; each later slice extends it.
- Audit filter registry: the `contracts` group already lists `Contract` and `ContractPayment`; add `ContractSettings` (the slice that creates it, 3) and labels "Contract" and "Payment (instalment)" in `audit.json` (sq/en) so FR-AUD-12 reads "Payment".

**Frontend**
- `RolesSettingsContent.tsx`: the contracts, payments and performance groups render with the new permission and its label; the "Milestone 3" tag disappears from the three activated keys.

**Tests**
- `FR-RBAC-19`: the catalogue contains `contracts.terminate`; the three keys are not tagged M3.
- `FR-RBAC-20`: the upgrade on a tenant with a customised Reception leaves it unchanged and gives it no commercial permission; a permission the Administrator revoked earlier is not restored; running the upgrade twice changes nothing; a new tenant gets the full matrix and the ledger row.
- `FR-RBAC-21`: `redactFields` removes every listed contract and payment field for a role without the permission; Reception output equals exactly number, status, validity, start, end, company (the test is written against the final shape in Slice 6 and fails for any field added without being listed).
- `NFR-SEC-04`: `permissionMatrix.test.ts` expectations for `contracts.terminate` and the payment keys.
- `FR-AUD-12`: `GET /audit/entity-types` returns the contracts group with both types.

**Done when:** The roles screen shows the new keys, the upgrade migration runs on a copy of a populated database without changing any customised role, and the permission matrix tests are green.

---

### Slice 3 — Contract settings

**Goal:** The Administrator can set the reminder lead times, the expiring-soon window, the payment grace days and the contract number prefix. Defaults exist for every workspace. Every change is audited.

**Requirements:** FR-REN-01 (setting, validation) · FR-REN-04 (setting) · FR-PAY-09 (grace days setting) · FR-CON-05 (prefix setting) · FR-AUD-11 (settings audit) · Q6, Q13 defaults

**Depends on:** 2

**Data**
- `ContractSettings (tenantId PK, reminderLeadDays Json default [60,30,7], expiringSoonDays Int default 30, paymentGraceDays Int default 0, numberPrefix String default 'CTR', updatedAt, updatedByUserId)`, one row per workspace, in both schemas. A row is created lazily with defaults when absent, so the migration does not need to insert for every tenant.

**Backend**
- `GetContractSettingsUseCase`, `UpdateContractSettingsUseCase` under `backend/src/contracts/application/use-cases/`, using the module's write transaction with an audit entry (entity type `ContractSettings`, old and new values).
- Validation in the domain: lead times are a non-empty list of distinct integers from 1 to 365, stored sorted descending (max 5 entries); expiring-soon 1–365; grace days 0–30; prefix 2–6 uppercase letters or digits.
- Routes under `/settings/contracts`, guarded by `settings.manage`. Read access for the use cases that need the values is internal, not through the route.
- Add `ContractSettings` to `AUDITED_ENTITY_TYPES` and the registry group.

**Frontend**
- A "Contracts and payments" section in the settings area with the four fields, validation messages and a save button (sq/en). The 360 px suite includes it.

**Tests**
- `FR-REN-01`: valid and invalid lists (empty, duplicates, 0, 400, 6 entries); stored sorted.
- `FR-REN-04`, `FR-PAY-09`: bounds.
- `FR-CON-05`: prefix rules.
- `FR-AUD-11`: a settings change writes one audit entry with old and new values in the same transaction; a failed audit rolls the change back.
- Permission: a Sales Manager gets 403.

**Done when:** The Administrator changes the lead times to 90 and 30, the screen and `GET` return them, and the audit log shows the change.

---

### Slice 4 — Contract from a won deal

**Goal:** From a Won deal, a user creates a contract that is filled from the deal and its offer, with a sequential number. The agreed values are read only. Contracts are listed, searched and shown on the company page and its timeline. Legacy contracts without a deal stay readable.

**Requirements:** FR-CON-01, 02, 03, 04, 05, 06, 07, 08, 09 · FR-CON-10 (Draft edit rules) · FR-RBAC-22 · FR-RBAC-21 (field list for the new fields) · NFR-DAT-01 (one contract per deal) · NFR-ACC-03 (schema) · NFR-OPS-03 (migration) · Q1, Q9

**Depends on:** 1, 2, 3

**Data** (D1, D2)
- `Contract`: add `dealId String? @unique`, `quotationId String?`, `number String?` (unique with `tenantId`), `packageId String?`, `servicesSnapshot Json?`, `termsText Json?` (TipTap JSON, validated as in M2 D10), `agreedAnnualValue Decimal(12,2)?`, `discountPercent Decimal(7,2)?`, `renewalDate DateTime?`, `lockedAt DateTime?`, `suspendedAt DateTime?`, `suspensionReason String?`, `cancelReason String?`, `notRenewingReasonId String?`, `notRenewingNote String?`. Relations to `Deal`, `Quotation`, `ServicePackage`, `LostReason`. Convert `amount` to `Decimal(12,2)`.
- `ContractPayment`: convert `amount` and `paidAmount` to `Decimal(12,2)`; default status `NOT_INVOICED`; add `invoiceNumber String?`, `invoiceDate DateTime?`, `overdueNotifiedAt DateTime?`. (The payment columns are converted here so the whole Float → Decimal migration is one reviewed step.)
- `DocumentSequence`: `kind = CONTRACT` needs no schema change.
- Postgres migration and MySQL script `mysql_migration_m3_contracts.sql` folded into `mysql_upgrade_to_current.sql`. The migration writes the rounding report (D2) and refuses to continue if a row would change by 0.005 or more without a reviewed override.

**Backend**
- `CreateContractFromDealUseCase`:
  - Requires `contracts.manage` at a scope that admits the deal's company, a deal in stage WON, and `Tenant.salesWorkflow = SALES_PROCESS`. A request without a deal returns a validation error (FR-CON-02).
  - Reads the deal and its `wonQuotationId` offer snapshot. Copies company, deal, offer, salesperson, package and services, `agreedMonthlyPrice → amount`, `agreedAnnualValue`, discount %, and the offer terms. Start defaults to the deal closing date, end to D4, billing period to monthly (FR-CON-03). Price, annual value, package and services are not accepted from the request (FR-CON-04).
  - Takes the number from `DocumentSequence` under a row lock (D3, FR-CON-05). The unique index on `dealId` makes a parallel second create fail and the use case maps it to a clear refusal (NFR-DAT-01, FR-CON-01).
  - Writes `Contract` audit, a status history row (`null → DRAFT`) and the company timeline event, in one transaction.
  - Q9: a deal of type EXTRA_SERVICES gets its own contract.
- `RefreshContractFromDealUseCase`: only in DRAFT; re-reads the deal's current won offer (FR-CON-04); refused from PENDING_SIGNATURE on.
- `UpdateContractUseCase` (exists): while DRAFT, dates, billing period, terms, renewal date, notes and salesperson are editable (FR-CON-10). The after-activation limit (only notes, document and renewal date) is added in Slice 5 with activation. There is no delete use case or route; a Draft is cancelled (Slice 5).
- `SearchContractsUseCase` and `GetClientContractsUseCase` (exist): filters by number, company, status, validity (uses `Contract.validityOn` through a database-neutral predicate that is tested against the domain function), salesperson, end-date range, payment state (any overdue instalment) and predefined Area and City ids (FR-CON-08). Scope through `contractAccess.ts` and `RecordScopeResolver`, with the Team test from D12 (FR-RBAC-22): a Sales User opening a colleague's contract by id gets 404.
- `presentContract.ts`: add every new field in one place. A contract without a deal returns `legacy: true`.
- `PrismaContractTimelineSource.ts` (exists, M1 FR-CMP-05): add "Contract CTR-… created" with a link, and status changes with the reason (FR-CON-09).
- `GET /deals/:id` returns `contractId` when one exists, so the deal screen can swap the button for a link.

**Frontend**
- Deal screen: "Create contract" for a Won deal with `contracts.manage`, replaced by a link afterwards (FR-CON-01). Also on the company page.
- `ContractFormPage.tsx` / `ContractFormContent.tsx`: price, annual value, package and services shown read only; dates, billing period, terms, renewal date, notes and salesperson editable while Draft. A "Refresh from deal" button while Draft. The old free-text plan name and amount fields are hidden in `SALES_PROCESS` workspaces.
- `ContractDetailContent.tsx`: every field of FR-CON-06 (number, status, validity, company, deal, offer, salesperson, package and services, dates, renewal date, price, annual value, discount, billing period, terms, notes, document, previous term, status history, payment summary); a "Legacy: no deal" label.
- `ContractListContent.tsx`: the new filters, the number column, the validity badge placeholder (completed in Slice 6).
- Company page: a contracts section and the timeline events.

**Tests**
- `FR-CON-01`: create from a Won deal; a second create is refused; the button/link swap; two parallel creates → one wins (`NFR-DAT-01`, run against both schemas).
- `FR-CON-02`: no deal → validation error; a legacy row opens with the Legacy label.
- `FR-CON-03`: Example A with a 1 March 2027 start → €49.40, €592.80, end 29 February 2028.
- `FR-CON-04`: the request cannot set price; Refresh after a new won offer shows the new price; refused after lock.
- `FR-CON-05`: two simultaneous creates get consecutive numbers; the prefix setting is used; the number resets each year.
- `FR-CON-06`: a field-by-field check of the detail response for a user with commercial details.
- `FR-CON-07`: default renewal date with lead times 60, 30, 7.
- `FR-CON-08`: each filter; a Sales User sees only own companies; "Expiring soon" shows only valid contracts in the window.
- `FR-CON-09`: the timeline shows creation.
- `FR-CON-10`: a Draft's dates are editable; there is no delete route.
- `FR-RBAC-22`: Own, Team, All; the Team set excludes an Administrator-owned company.
- Migration test: `NFR-ACC-03` no `Float` column left in `Contract` and `ContractPayment`; the rounding report is empty on the fixture; existing rows keep amounts to two decimals; `NFR-OPS-03` runs on Postgres and the MySQL script.

**Done when:** UAT-1 steps 1 and 2 pass locally: the contract exists with number, price €49.40, annual value €592.80, package, services and end date, and the price cannot be typed.

---

### Slice 5 — Contract lifecycle & signed document

**Goal:** A contract moves through Draft, Pending Signature, Active, Suspended and Cancelled with the rules and permissions of SRS §3.2. A signed PDF is attached and versioned. Activation generates the instalments and makes the company a Client. Suspending, cancelling and reinstating need a reason.

**Requirements:** FR-CON-10 (after activation) · FR-CON-11, 12, 13, 14, 15, 18, 19 · FR-PAY-01 · FR-PAY-02 (generation) · FR-AUD-11 (contract actions, document) · NFR-SEC-06 (transitions, document access) · Q5

**Depends on:** 4

**Data**
- `ContractDocument (id, tenantId, contractId, fileName, url, uploadedByUserId, uploadedAt, isCurrent)`, index on `(contractId, isCurrent)`; the migration copies an existing `documentUrl` into one current row (D14).

**Backend**
- A single `ChangeContractStatusUseCase` (replacing the separate `ActivateContractUseCase` and `CancelContractUseCase` entry points for `SALES_PROCESS`, which become thin wrappers) that takes the target status and a reason, checks `canTransition` (Slice 1) and the permission for that transition (`contracts.manage` or `contracts.terminate`), and writes history, audit and timeline in one transaction.
  - DRAFT → PENDING_SIGNATURE: needs start, end, billing period and price; sets `lockedAt` (FR-CON-12).
  - DRAFT or PENDING_SIGNATURE → ACTIVE: needs a current signed document; calls the schedule from Slice 1; inserts the instalments, all `NOT_INVOICED`, none Paid; sets the company status to Client if it is not (the M1 locked `STATUS` field, M1 Q9) (FR-CON-13, FR-PAY-01).
  - ACTIVE ↔ SUSPENDED: reason required, stored on the history and on the contract (FR-CON-14).
  - Cancel from DRAFT, PENDING_SIGNATURE, ACTIVE or SUSPENDED: reason required; removes `NOT_INVOICED` instalments with a future due date (D15, FR-CON-15); a Draft can be cancelled by `contracts.manage`, the others need `contracts.terminate`.
  - EXPIRED → anything and CANCELLED → anything: refused. The CEO and Reception get 403 on every transition (FR-CON-11).
- `UpdateContractUseCase`: after activation only notes, the signed document and the renewal date can change; changing the end date is refused with the "renew instead" message (FR-CON-10).
- `AttachContractDocumentUseCase` (exists) and `ContractDocumentStore.ts`: PDF only, 15 MB, magic bytes; replacing keeps the old file as a previous version with date and user (FR-CON-19). Endpoints for list, download and upload; download needs `commercial.view` and access to the contract. Reception gets 403.
- Winning a deal still never creates or changes an instalment (FR-PAY-01): a test on `WinDealUseCase`.
- Notifications: new types `CONTRACT_SUSPENDED` and `CONTRACT_CANCELLED` (sq/en) to the salesperson and the Sales Manager.
- `ContractStatusHistory` already stores `note`; the reason goes there and shows in the timeline (FR-CON-18).

**Frontend**
- Contract detail: action buttons that depend on the status and the user's permissions (Mark pending signature, Attach document, Activate, Suspend, Reinstate, Cancel), a reason dialog, the status history, the document list with previous versions, and the instalment summary.
- Locked fields are shown read only after Pending Signature.

**Tests**
- `FR-CON-11`: every disallowed transition returns a validation error through the API; CEO and Reception get 403 on each; a Sales User cannot suspend.
- `FR-CON-12`: a Draft without an end date cannot be marked Pending Signature; values are locked afterwards.
- `FR-CON-13`: activating without a document is refused; with one, a monthly 12-month contract has 12 instalments, all Not Invoiced; the company becomes Client.
- `FR-CON-14`: suspend and reinstate need a reason; the reason is stored.
- `FR-CON-15`: cancelling in month 4 with 3 paid, 1 invoiced and 8 not invoiced leaves 4.
- `FR-CON-18`: the history lists Draft, Pending Signature and Active with names and dates.
- `FR-CON-19`: a renamed `.exe` is refused; a 16 MB file is refused; after replacing, two versions are listed; Reception gets 403.
- `FR-CON-10`: end date change on an Active contract is refused.
- `FR-PAY-01`: win a deal → zero instalments.
- `FR-AUD-11`: each action writes one audit entry in the same transaction.
- The scenario test for UAT-1 (steps 1–5) and the Suspend step of UAT-4 runs on a seeded tenant.

**Done when:** UAT-1 passes locally end to end: Pending Signature, refused activation without a document, document attached, Active, 12 instalments, company is Client and its timeline shows each status change.

---

### Slice 6 — Validity & Reception view

**Goal:** Reception sees whether a company has a valid contract, with start and end dates and the reason when it is not valid, and nothing else. The same badge shows on the contract list and the company page.

**Requirements:** FR-CON-20, 21, 22 · FR-RBAC-21 (Reception contract response) · NFR-SEC-06 (Reception) · UAT-4

**Depends on:** 4

**Backend**
- `validityBadge.ts` (application layer): given a company's contracts, the date and `ContractSettings`, picks the contract valid today (the one ending last if several), otherwise the latest, and returns `{ status: VALID | EXPIRING_SOON | NOT_VALID, reason, startsOn, endsOn, daysLeft }`. It calls `Contract.validityOn` only (FR-CON-20, 22).
- Company search results (`SearchClientsUseCase` and the response mapper) include the badge for users with `contracts.validity.view`, computed in one batched query per page, never one query per row.
- `GET /clients/:id/contract-validity` (or the existing company detail response) returns the badge; the contract list returns it per row.
- `presentContract.ts`: the Reception shape contains exactly number, status, validity, start and end date, company (FR-RBAC-21). `GET /contracts/:id` for Reception returns that shape; the document, payments, deal and offer endpoints return 403.

**Frontend**
- A `ValidityBadge` component (Valid until dd.mm.yyyy / Expiring soon / Not valid: reason) used in company search results, the company page and the contract list; colours and labels follow the status labels the Administrator configured (M1 FR-SET-07), with text, not colour alone.
- Reception search shows the badge and no price.

**Tests**
- `FR-CON-20`: starts tomorrow → "Not valid: Not started"; on the end date it is still valid, the day after it is Expired (through the API with a fixed clock).
- `FR-CON-21`: Reception searches the UAT company and sees "Valid until 29.02.2028"; the response contains no price, payment, deal, offer or document field (snapshot of the key set); the document endpoint returns 403.
- `FR-CON-22`: an Expired 2026 term plus an Active 2027 term → Valid; two Active terms → the one ending last.
- `FR-RBAC-21`: the Reception contract response has exactly the six fields.
- Query count: a page of 50 companies uses a bounded number of queries (guards the N+1).
- The UAT-4 scenario test (Reception checks, Sales Manager suspends, Reception sees "Not valid: Suspended", reinstate) runs on the seeded tenant.

**Done when:** UAT-4 passes locally.

---

### Slice 7 — Expiry job & company status

**Goal:** An Active contract becomes Expired by the system after its end date, once, with a history entry and a notification. The company becomes Former client when nothing valid or upcoming remains. This slice also creates the job helper every later job uses.

**Requirements:** FR-CON-16, 17 · NFR-REL-01 (helper and the expiry job) · Q16

**Depends on:** 5

**Backend**
- `backend/src/scheduler/jobs/dailyJob.ts`: a helper that iterates tenants, resolves `tenantDay`, and passes `{ tenant, today }` to a callback, with per-tenant error isolation (one failing tenant does not stop the others). The existing `ContractExpiryJob.ts` is moved onto it. Written so the payment overdue job (Slice 9) and the reminder job (Slice 11) use it too.
- `ExpireContractUseCase` (exists): selects `ACTIVE` contracts with `endsAt < today` (not "yesterday", so a gap catches up), sets EXPIRED with `changedByUserId = null`, writes history, audit and timeline, then notifies the salesperson and the Sales Manager **only if no renewal exists** (`renewedInto` null and no open renewal deal). A second run finds nothing.
- `UpdateCompanyStatusUseCase`/service: after an Expired or Cancelled transition, if the company has no valid or upcoming contract (status ACTIVE with end date ≥ today, or PENDING_SIGNATURE/DRAFT with a start in the future counts as upcoming) **and no open renewal deal**, set Former client (FR-CON-17). Activating a contract sets Client again (Slice 5).
- Notification type `CONTRACT_EXPIRED` (sq/en), with the existing `CONTRACT_EXPIRING` kept as is.

**Frontend**
- Company page: status Former client shows with the existing status label. No new screen.

**Tests**
- `FR-CON-16`: a contract ending yesterday becomes Expired on the next run with `changedByUserId = null`; a second run adds no history or notification; after a simulated two-day gap the same final state; a failing notification does not stop the state change and is retried; no notification when a renewal exists.
- `FR-CON-17`: after the only contract expires the company is Former client; with an open renewal deal it stays Client; a new activated contract sets Client.
- `NFR-REL-01`: the helper isolates a failing tenant; "today" follows `Europe/Tirane` at 23:30 and 00:30 around a date change.

**Done when:** Moving the clock past the end date and running the job on the seeded tenant produces the UAT-7 step 3 result: Expired by the system, still in the history.

---

### Slice 8 — Instalments: invoices, receipts, history

**Goal:** An authorised payment user records invoices and receipts and manages instalments with a full history. Everyone else sees instalments read only, or not at all. The contract shows a payment summary.

**Requirements:** FR-PAY-03, 04, 05, 06, 07, 08, 10, 12 · FR-RBAC-24 · FR-RBAC-21 (payment fields) · FR-RBAC-22 (instalments) · FR-AUD-11 (instalment actions) · NFR-ACC-03 · NFR-SEC-06 · Q3, Q4

**Depends on:** 5

**Data**
- `ContractPaymentHistory (id, tenantId, paymentId, fromStatus, toStatus, amountReceived Decimal(12,2), changedByUserId String?, comment String?, createdAt)`, index on `(paymentId, createdAt)` (`onDelete: Restrict` on the user, as in `ContractStatusHistory`).
- `ContractPayment.method`: keep the free-text column but validate to `BANK_TRANSFER | CASH | CARD | OTHER` in the domain for new writes (FR-PAY-03). Existing free-text values stay readable.

**Backend**
- Use cases on top of the Slice 1 domain: `RecordInvoiceUseCase` (number and date, status Invoice Issued), `MarkPaymentPendingUseCase`, `RecordReceiptUseCase` (amount, date not in the future, method; adds to `paidAmount`; status becomes Partially Paid or Paid; a receipt above the outstanding is refused), `ReverseReceiptUseCase` (D6), `CorrectPaymentStatusUseCase` (back to an earlier status with a comment, only when nothing received), `AddContractPaymentUseCase`, `UpdateContractPaymentUseCase` (due date or amount only with nothing received), `DeleteContractPaymentUseCase` (nothing received). Add, change and remove need a reason. The existing use cases are reused where they match and rewritten on the domain functions otherwise.
- Every use case requires `payments.update` through `requirePermission` and a use-case check. Sales User, Sales Manager, Reception and CEO get 403 even for their own contracts (FR-PAY-05, FR-RBAC-24).
- Each use case writes one `ContractPaymentHistory` row (actor, old and new status, amount received, comment) and one `ContractPayment` audit entry in the same transaction (FR-PAY-08, FR-AUD-11).
- Reads: `GET /contracts/:id/payments` needs `payments.view` and contract scope (FR-RBAC-22); a user without `commercial.view` sees no amounts and Reception sees no payment data at all (FR-PAY-12, via `redactFields`). The contract summary uses `summarise` from Slice 1 (FR-PAY-10).
- Changing the contract price later never changes issued instalments: a test keeps the existing rule.

**Frontend**
- Contract detail, "Payments" tab: the schedule table (due date, amount, status, received, outstanding, invoice, flag "Due, not invoiced"), the summary row, an instalment drawer with history. Edit controls (Record invoice, Mark pending, Record receipt, Reverse receipt, Add, Change, Remove) only for `payments.update`; others see no controls.
- The status select never offers Paid or Partially Paid (FR-PAY-06).

**Tests**
- `FR-PAY-05`: a Sales User calling every write API on an instalment of their own contract gets 403; Sales Manager, CEO and Reception too (`FR-RBAC-24`); the Administrator succeeds; a custom Finance role with `payments.update` succeeds.
- `FR-PAY-03`: all fields can be edited by an authorised user and are visible.
- `FR-PAY-04`: add with a reason; removing an instalment with €20 received is refused; changing the amount of a Paid instalment is refused; a later price change leaves issued instalments alone.
- `FR-PAY-06`: Invoice Issued needs number and date; Paid is not offered; a full receipt sets Paid; a correction needs a comment.
- `FR-PAY-07`: the €20.00 / €29.40 / €1.00 sequence from the SRS through the API.
- `FR-PAY-08`: the history lists Invoice Issued, the €20.00 receipt and the €29.40 receipt, with user and date.
- `FR-PAY-10`: the contract summary example.
- `FR-PAY-12`: Reception responses contain no payment field; a role without `commercial.view` sees no amounts; a Sales User sees only own companies' payments.
- `FR-AUD-11`: each action creates one audit entry.
- The UAT-2 scenario test runs on the seeded tenant.

**Done when:** UAT-2 passes locally: the Sales User cannot change an instalment, the authorised user records INV-1, Payment Pending, €20.00 then €29.40, the extra €1.00 is refused, and history and audit show each step.

---

### Slice 9 — Overdue job, Payments overview, notifications & CSV

**Goal:** A daily job marks instalments Overdue and notifies the right people once. A Payments overview lists instalments by scope with filters and totals, and exports to CSV.

**Requirements:** FR-PAY-09 · FR-PAY-11 · FR-PAY-13 · FR-PAY-14 · FR-AUD-13 (payment export) · NFR-REL-01 · NFR-PERF-04 (list) · Q12, Q13

**Depends on:** 3, 8

**Data**
- Indexes: `ContractPayment (tenantId, dueDate)` and `(tenantId, status, dueDate)` (exists) are checked against the overview queries; add `(tenantId, paidAt)` for the revenue figure used in Slices 13–14.

**Backend**
- `MarkPaymentsOverdueJob` (new, `backend/src/scheduler/jobs/`) on the Slice 7 helper. Selects instalments in `INVOICE_ISSUED`, `PAYMENT_PENDING` or `PARTIALLY_PAID` whose `dueDate + paymentGraceDays < today`, sets OVERDUE with `changedByUserId = null`, writes history and audit (D7). `NOT_INVOICED` instalments are never changed; the response carries `dueNotInvoiced` (FR-PAY-09).
- Notification type `PAYMENT_OVERDUE` (sq/en): once per instalment (`overdueNotifiedAt`), to every user holding `payments.update`, the responsible salesperson and the Sales Manager (D9 of M2: `toPermission` and `toUser`), opening the contract (FR-PAY-13). The marker is set only after the notification was emitted, so a failure is retried.
- `SearchPaymentsUseCase` for `GET /payments`: filters by status, company, salesperson, due date range, contract and flag "Due, not invoiced"; totals of amount, received and outstanding for the filtered list, computed in the database as `Decimal` (FR-PAY-11). Scope: Sales User Own, Sales Manager Team, CEO and authorised payment users All, through `payments.view`.
- `GET /payments/export.csv`: the same filters, the same scope, UTF-8 with BOM, money as plain decimals; writes an audit entry with who, when and the filters (FR-PAY-14, FR-AUD-13). A contract's instalments export from the same use case with the contract filter.

**Frontend**
- A Payments overview page and menu item for users with `payments.view`: filters (status, company, salesperson, date range, contract, Area and City from predefined lists), a table with totals, the Overdue and "Due, not invoiced" markers, an Export CSV button, and rows that open the contract. Added to `mobile360.spec.ts`.

**Tests**
- `FR-PAY-09`: an instalment due yesterday in Payment Pending → Overdue after the run; Not Invoiced → flag only; grace days 3 delays it; idempotent; two-day gap; a partly paid past-due instalment flips as in D7 without a second notification.
- `FR-PAY-13`: one notification per overdue instalment to the three recipient groups; none on the second run; a failed send is retried.
- `FR-PAY-11`: filter Overdue shows only the user's scope with totals that equal the sum of the rows; Sales User Own, Sales Manager Team, CEO All.
- `FR-PAY-14`: the CSV equals the filtered rows; an audit entry is created; a user without `payments.view` gets 403.
- `NFR-REL-01`: the job on the shared test harness.
- The UAT-3 scenario test runs on the seeded tenant.

**Done when:** UAT-3 passes locally: the seeded Payment Pending instalment becomes Overdue by the system, the Not Invoiced one shows "Due, not invoiced", the three recipients are notified, and the Sales Manager's overview shows the overdue instalment with totals that add up.

---

### Slice 10 — Renewal deal & renewal contract

**Goal:** From an expiring or expired contract, a salesperson starts a Renewal deal. When that deal is won, "Create contract" pre-fills the next term, linked to the previous one. Nothing renews automatically.

**Requirements:** FR-REN-06, 07, 10 · FR-CON-01 (renewal path) · FR-AUD-11 (renewal link) · Q8

**Depends on:** 5

**Data**
- `Deal.renewalOfContractId String?` with an index; a unique index for one open renewal deal per contract where the database allows it (D9). `Contract.renewedFromContractId @unique` already exists and is reused for the link.

**Backend**
- `StartRenewalUseCase` (`contracts.manage` plus `deals.edit` at a scope that admits the contract, D17): refused if the contract is not Active, Suspended or Expired (not Draft, Pending Signature or Cancelled), already has `renewedInto`, is marked Not renewing, or has an open renewal deal. Creates a Deal of type RENEWAL in stage Interested, owned by the contract's salesperson (editable), with the company data filled in, `renewalOfContractId` set, a stage history row (with the owner, D13) and a `Deal` audit entry. Runs in one transaction with the contract audit entry "renewal started".
- `CreateContractFromDealUseCase` (Slice 4): for a won RENEWAL deal, the start date defaults to the day after the previous end date, `renewedFromContractId` is set, the number is new, no reminders exist yet, and the old contract is not changed (FR-REN-07). The previous contract's `renewedInto` shows the new number.
- `RenewContractUseCase` (exists) stays for non-`SALES_PROCESS` workspaces and is refused in `SALES_PROCESS` (FR-REN-10). A test greps the scheduler jobs for any contract or deal create call: none creates a contract or deal (FR-REN-10).
- Company status: starting and winning a renewal keeps the company Client (Slice 7 rule).

**Frontend**
- Contract detail and Renewals (Slice 11): "Start renewal" button when allowed, linking to the new deal; the contract shows "In negotiation" with a link to the open deal; the new contract shows "Renews CTR-…" and the old one "Renewed by CTR-…".
- The deal screen shows "Renewal of CTR-…" and, when Won, "Create contract" with the pre-filled start date.

**Tests**
- `FR-REN-06`: a Renewal deal exists in Interested after the call; a second renewal for the same contract is refused while one is open; refused for a Cancelled contract; a Sales User cannot start a renewal for a colleague's contract.
- `FR-REN-07`: the new contract starts the day after the old end date and links both ways; the old contract keeps its status and history.
- `FR-REN-10`: in `SALES_PROCESS`, `RenewContractUseCase` is refused; no job creates a contract or deal on its own.
- Two parallel "Start renewal" calls create one deal.

**Done when:** UAT-7 step 2 passes locally: a Renewal deal is started from the seeded contract, won with the Milestone 2 flow, and the new contract starts the day after the old end date and links to it.

---

### Slice 11 — Renewal reminders, Renewals screen & calendar items

**Goal:** Salespeople and the Sales Manager get reminders at the configured lead times, once each. A Renewals screen shows what is ending and what has just ended, with the renewal state. Contract end and renewal dates show in the sales calendar.

**Requirements:** FR-REN-01, 02, 03, 05, 08, 09, 11 · FR-CON-17 (Recently expired) · NFR-REL-01 · NFR-PERF-04 (list) · Q6, Q7

**Depends on:** 3, 7, 10

**Data**
- `ContractReminder (id, tenantId, contractId, leadDays Int, state String, sentAt DateTime, @@unique([contractId, leadDays]))`, in both schemas (NFR-DAT-01). The migration drops `Contract.expiryNotifiedAt` after copying its value into a `ContractReminder` row with `leadDays = 30`, `state = SENT` for contracts already warned, so no contract is reminded twice after the upgrade (NFR-OPS-03).
- `Contract.notRenewingReasonId` and `notRenewingNote` already exist from Slice 4.

**Backend**
- `ContractRenewalReminderJob.ts` (exists): rewritten on the Slice 7 helper and on D8. The fixed `RENEWAL_LEAD_DAYS` constant is replaced by the setting. For each Active contract in the window, it computes the lead time to send (smallest reached and not recorded), records larger unrecorded ones as `SKIPPED`, emits `CONTRACT_EXPIRING` (existing type, `leadDays` added to its parameters) to the salesperson and every user with `contracts.manage` at Team or All scope for that contract, and **writes the `SENT` row only after the emit succeeded** (FR-REN-02, FR-REN-03). A contract marked Not renewing, a Suspended contract, or one with a renewal contract gets none. A renewal contract starts with no rows.
- `SearchRenewalsUseCase` for `GET /renewals`: valid contracts ending in the next 30, 60 or 90 days, and contracts Expired within the last 90 days ("Recently expired"), with end date, days remaining, salesperson, monthly price (redacted without `commercial.view`) and the derived renewal state (D9). Scope Own, Team, All (FR-REN-05, FR-REN-09).
- `MarkNotRenewingUseCase` (`contracts.manage`): reason from the active lost-deal reasons plus a note; stops further reminders; audited; reversible by the same use case (FR-REN-08).
- Calendar: the Slice 12 (M2) calendar query adds read-only items of kind `CONTRACT_END` and `CONTRACT_RENEWAL` for the user's scope, opening the contract (FR-REN-11). They are not editable and not draggable.
- The "expiring soon" window comes from `ContractSettings` and is used by the badge (Slice 6) and the dashboards.

**Frontend**
- A Renewals page and menu item: tabs 30 / 60 / 90 days and Recently expired, columns as above, state chips, "Start renewal" and "Not renewing" actions. Added to `mobile360.spec.ts`.
- The reminder notification opens the contract with "Start renewal".
- The calendar renders the two read-only item kinds with their own icon, and a click opens the contract.

**Tests**
- `FR-REN-01`: changing the list to 90 and 30 sends at 90 and 30 for contracts not yet past those points; a contract already past 90 is recorded SKIPPED, not reminded twice.
- `FR-REN-02`: a contract ending in 30 days notifies the salesperson and the Sales Manager once each, with company, number, end date and days remaining; an Administrator with `contracts.manage` at All scope is included, the CEO is not.
- `FR-REN-03`: twice on the same day → nothing the second time; a failed send is retried; a two-day gap sends each reachable lead time once; a renewal contract starts with none.
- `FR-REN-05`: a Sales User sees only own contracts; an open renewal deal shows In negotiation with the deal link; Renewed and Not started.
- `FR-REN-08`: after marking, the screen shows Not renewing with the reason and the 7-day reminder is not sent.
- `FR-REN-09`: an Expired contract appears under Recently expired for 90 days and then not.
- `FR-REN-11`: a contract ending on 28 February shows on that day for its salesperson and not for another Sales User.
- `FR-CON-17`: the company status matches the Renewals state transitions.
- The UAT-7 scenario test (steps 1–3, with a fixed clock) runs on the seeded tenant.

**Done when:** UAT-7 steps 1 to 3 pass locally: the 30-day reminder goes out once to the salesperson and the Sales Manager, the renewal is started and won, the old contract expires by the system and the company stays Client.

---

### Slice 12 — KPI engine & Performance screen

**Goal:** Users with "Performance: view" see one row per salesperson and a total row, with the fourteen indicators, filtered by salesperson and date range. The formulas are pure, tested domain functions that the dashboards reuse.

**Requirements:** FR-PRF-01, 02, 03, 04, 05, 06, 07, 08, 09, 10 · FR-RBAC-23 (performance) · FR-RBAC-21 (value fields) · FR-AUD-13 (performance export) · NFR-ACC-04 (§6.2 and the FR-PRF-04 example) · NFR-PERF-04 · Q11

**Depends on:** 2

**Data** (D13)
- `DealStageHistory.ownerUserId String?` with an index on `(tenantId, ownerUserId, toStage, at)`. The migration backfills rows from the deal's current owner. `Deal.reassign` and every stage change write the owner at that time.
- Indexes for the period queries: `Deal (tenantId, wonAt)`, `(tenantId, lostAt)`; `Interaction (tenantId, userId, occurredAt)`; `Quotation (tenantId, sentAt)`; the follow-up completion date `(tenantId, completedAt)` (names checked against the M2 schema).

**Backend** (`backend/src/dashboard/domain/KpiDefinitions.ts`, `backend/src/dashboard/application/wellness/`)
- Pure functions: `conversionRate(won, lost)` (one decimal, `null` when no closed deals), `averageTimeToClose(days[])` (`null` when none), `onTimeShare`, `totalRow(rows)` which sums the underlying counts and sums and recomputes the rates from them (FR-PRF-04), `periodChange(current, previous)`.
- `GetPerformanceUseCase` takes the access context, a list of salesperson ids and a period (presets This week, This month, Last month, This quarter, This year, custom; default This month; the workspace week starts Monday):
  - Scope from the user's `performance.view` (Own: only their row, no ranking and no other row; Team: all Sales Users; All): a salesperson id outside the scope returns 403, never a silent filter (FR-PRF-01, FR-RBAC-23).
  - Indicators per §6.2, each on its own date in the workspace time zone and attributed to the salesperson responsible at that time (FR-PRF-05): calls, emails, visits, meetings (online meetings count as meetings), companies contacted (distinct), offers created (first version only), offers sent, deals won and lost (from the history owner, latest result only), total value (agreed annual value), conversion rate, follow-ups completed (with the on-time share), overdue follow-ups (as of now), average time to close.
  - Salespeople deactivated later keep their row if they have activity in the period.
  - Optional previous-period comparison (FR-PRF-06).
  - Value indicators are dropped from the response without `commercial.view` (FR-PRF-10).
- Drill-down: `GET /performance/records?indicator=&salespersonId=&from=&to=` returns the underlying activities, offers, deals or follow-ups with the same scope (FR-PRF-07).
- `GET /performance/series` returns the indicators per week or month for one salesperson (FR-PRF-08, Could).
- Export: PDF through the existing `reports/` output and CSV, with an audit entry (who, when, filters) (FR-PRF-09, FR-AUD-13).

**Frontend**
- A Performance page and menu item: filters (salesperson multi-select for Manager and CEO, presets, custom range), the table with the total row, change arrows, clickable indicators opening the underlying list, an optional detail view with a chart and its table view, and export buttons. Added to `mobile360.spec.ts`. `performance.json` (sq/en).

**Tests**
- `FR-PRF-01`: the Manager sees every Sales User and the total; a Sales User sees only their own row and gets 403 for another id; the CEO sees the same as the Manager; the Administrator has no access.
- `FR-PRF-02`: one salesperson and Last month shows one row for that month.
- `FR-PRF-03`: all fourteen indicators are present on a row and the total row.
- `FR-PRF-04`: 40% (4 won, 6 lost) and 50% (1 won, 1 lost) → total 5 ÷ 12 = 41.7%; average time to close from the combined deals, not the average of averages.
- `FR-PRF-05`: a deal won on the last day of the month at 23:30 workspace time counts in that month; a deal reassigned after winning stays with the original salesperson; a deactivated salesperson keeps their history.
- `FR-PRF-06`, `FR-PRF-07`: change against the previous period; "Visits: 5" lists five visits.
- `FR-PRF-08`: the chart and table show the same numbers.
- `FR-PRF-09`: the export has the same rows and filters; an audit entry exists.
- `FR-PRF-10`: a role with `performance.view` without `commercial.view` sees counts and no money fields in the response.
- `NFR-ACC-04`: a table-driven test per §6.2 indicator on a fixed fixture (the seed has three months of activity for two salespeople).
- Volume test at the NFR-PERF-04 data size (2,000 deals, 5,000 activities).

**Done when:** UAT-6 passes locally: the Manager sees all indicators per salesperson and in the total, one salesperson and Last month shows one row, the total row is calculated from data, the Sales User sees only their own row, the CEO sees everyone.

---

### Slice 13 — Dashboard framework, Sales User & Sales Manager dashboards

**Goal:** Each user lands on the dashboard of their role, with a period selector, "as of now" labels, a refresh button, drill-down links and an empty state. The Sales User and Sales Manager dashboards show every figure of the SRS.

**Requirements:** FR-DSH-01, 02, 03, 04, 05, 06, 07, 08, 09, 10 · FR-RBAC-23 (dashboards) · NFR-ACC-04 (§5.3 and the worked example) · NFR-PERF-04 · Q10, Q11, Q14

**Depends on:** 12

**Backend**
- `GET /dashboard/home` (D11) returns the dashboard kind for the user.
- A common response shape for all dashboards: `{ kind, period, calculatedAt, figures: [{ key, label, value, basis: 'period' \| 'asOfNow', link }], tables, charts }`. Money as strings. A figure the user may not see is **absent**, not zero (FR-DSH-08).
- `GetSalesUserDashboardUseCase` (FR-DSH-09): own leads, own active deals with a count per stage, follow-ups due today and in the next 7 days, overdue follow-ups, offers created and sent, deals won, own sales value, own activity by type; Should: own contracts expiring soon and own overdue instalments (from Slices 7, 9, 11).
- `GetSalesManagerDashboardUseCase` (FR-DSH-10): total leads and per salesperson, active deals, the full team pipeline (count and value per stage), offers, follow-ups due and overdue in total and per salesperson, deals won and lost, conversion rate in total and per salesperson (reusing Slice 12), sales value, activity per salesperson, lost-deal analysis grouped by predefined lost reason (count and value); Should: pending discount approvals, contracts expiring soon and overdue instalments of the team.
- Definitions (§5.3) in `KpiDefinitions.ts`: lead = open deal in New Lead or Contacted; pipeline value = annual value of the latest offer of each open deal (a deal with no offer counts in the number and adds nothing to the value); sales value; conversion rate; lost-deal analysis. Where a figure follows the period the response says so; open pipeline and active contracts are `asOfNow` (FR-DSH-03).
- Scope: every query takes the scope from the access context; a `salespersonId` filter outside the scope is a 403 (FR-DSH-02, FR-RBAC-23). The Manager's totals are the sum of the Sales Users' figures and exclude other roles (D12).
- Area and City filters accept ids from the predefined lists only (FR-DSH-04).
- `calculatedAt` is the time of the request; nothing is stored (FR-DSH-07).

**Frontend** (`frontend/src/pages/dashboard/`, new files; the existing three pages are not touched)
- Login redirect by `GET /dashboard/home`; Reception goes to the company search; the dashboard is also in the main menu (FR-DSH-01).
- Shared components: `PeriodSelector` (Today, This week, This month default, This quarter, This year, custom), `KpiTile` (value, label, "as of now" or the period, optional link), `ChartWithTable` (every chart has a table view with the same numbers), `EmptyState`, `RefreshBar` ("Calculated at hh:mm" and a refresh button) (FR-DSH-03, 05, 06, 07).
- Money shown as EUR with two decimals in the number format of the user's language (sq or en).
- `SalesUserDashboard.tsx` and `SalesManagerDashboard.tsx` with the figures above, clickable figures opening the filtered lists from M2 (follow-ups, deals, offers) and from this milestone (payments, renewals) (FR-DSH-05).
- Added to `mobile360.spec.ts`. `dashboard.json` (sq/en).

**Tests**
- `FR-DSH-01`: each role lands on the right dashboard; Reception opens the search; a copied role follows its base key.
- `FR-DSH-02`: the Manager total equals the sum of the Sales Users' own figures and excludes any other role; a Sales User requesting another salesperson gets 403.
- `FR-DSH-03`: changing the period from month to year changes Deals won but not Active deals; the "as of now" label is present.
- `FR-DSH-04`: the location filter accepts only predefined ids.
- `FR-DSH-05`: the link of "Overdue follow-ups: 4" opens a list with the same 4.
- `FR-DSH-06`: a new workspace shows the empty state; sq and en formats.
- `FR-DSH-07`: after recording an activity and refreshing, the count increases.
- `FR-DSH-08`: a custom role without `commercial.view` gets no value figures and no value fields.
- `FR-DSH-09`, `FR-DSH-10`: figures on the seed data match UAT-5; won plus lost per salesperson equals the team total; the lost-reason figures add up to the lost deals; the conversion and sales value worked example (4 won, 6 lost → 40.0% and €2,872.80).
- Volume test at the NFR-PERF-04 size.

**Done when:** The Sales User and Sales Manager dashboards show the seed figures, the totals match the lists behind them, and a foreign request is refused (UAT-5 steps 1–3 for those two roles).

---

### Slice 14 — Administrator & CEO dashboards

**Goal:** The Administrator sees configuration, users and recent changes with no sales figures. The CEO sees the global, read-only overview of sales, revenue, contracts, payments and team performance.

**Requirements:** FR-DSH-11, 12, 13 · FR-DSH-02 (Administrator and CEO scope) · NFR-ACC-04 (revenue, recurring value, contract and payment figures) · NFR-PERF-04 · Q10, Q15

**Depends on:** 7, 9, 13

**Backend**
- `GetAdministratorDashboardUseCase` (FR-DSH-11): a pricing configuration summary (discount cap, active employee bands, risk surcharges, visit frequencies, price zones, each with its last-change date from the audit log), users per role and inactive users, the last 20 audit entries with a link to the full log, and items needing attention (cities in no price zone, a role with no users, a contract setting never changed is not an item). It returns no sales figure.
- `GetCeoDashboardUseCase` (FR-DSH-12):
  - Total sales pipeline (count and value), sales value in the period, **revenue in the period** (sum of amounts received by date received, from the `ContractPaymentHistory` receipt rows, so a reversed receipt nets out) (Q10), monthly recurring value (sum of the agreed monthly price of contracts valid today).
  - Sales performance per month (a series) and the team performance table (reusing `GetPerformanceUseCase` totals).
  - Contracts: active, expired and expiring soon with count and value. Payments: count and amount per status, outstanding and overdue. Operational indicators: overdue follow-ups, pending discount approvals, offers waiting. Company counts per status.
  - A `wellnessPlus` slot in the response shape that is empty and not rendered (M4).
  - Contract and payment figures call the same queries as the lists for All scope, so they match (FR-DSH-12 acceptance).
- The CEO dashboard endpoint and every link target the CEO can reach are read only: no write permission, so no edit control (FR-DSH-13, FR-RBAC-24).
- Payments and contract value figures need `payments.view` / `commercial.view`; otherwise they are absent (FR-DSH-08).

**Frontend**
- `AdministratorDashboard.tsx` and `CeoDashboard.tsx` on the Slice 13 components, with chart-and-table views, period selector, drill-down links and the empty state. The CEO page has no edit controls and the linked lists show none. Added to `mobile360.spec.ts`.

**Tests**
- `FR-DSH-11`: changing the discount cap shows it in the summary and in recent changes; no sales figure is in the response; "city in no zone" appears as an attention item.
- `FR-DSH-12`: contract and payment counts and amounts equal the list totals for All; revenue counts a receipt by date received and nets a reversal; monthly recurring value ignores Suspended and Expired contracts; the Wellness+ area is absent.
- `FR-DSH-13`: the CEO's follow-up links show no edit control and every write endpoint returns 403.
- `NFR-ACC-04`: figures on the seed data equal the test fixture.
- The UAT-5 scenario test runs for all four roles.

**Done when:** UAT-5 passes locally for all four roles, including the Administrator seeing no sales figures and the CEO's totals matching the lists.

---

### Slice 15 — Milestone hardening & UAT readiness

**Goal:** Staging is ready for Wellness Albania to run UAT-1 to UAT-7 with one user per role, and Phase 1 end to end.

**Requirements:** NFR-SEC-06, NFR-SEC-04 (review) · NFR-PERF-04 · NFR-USE-03 · NFR-I18N-03 · NFR-MNT-03 (verified) · NFR-OPS-03 (rehearsal) · NFR-REL-01 (verified) · NFR-DAT-01 (verified) · FR-RBAC-21, 23 (verified) · FR-AUD-11, 12, 13 (verified) · all UATs

**Depends on:** all

**Work**
- The generated permission matrix and route coverage tests pass with every M3 route. Reviewed exemptions are documented.
- Run `/security-review` on the milestone diff. Write `deploy/security-review-m3.md` in the M2 format:
  - Findings, fixes and accepted risks.
  - Check document access (no public `/uploads` URL for signed contracts, magic-byte check, size).
  - Check the redaction lists against every new response, especially Reception, a role with `payments.view` but no `commercial.view`, and the dashboards.
  - Check the dashboards and performance endpoints for scope bypass by request parameters (FR-RBAC-23).
  - Revisit the accepted risk from M1 and M2 "field redaction checks whether `commercial.view` is held, not its scope". Contract and payment values make it matter more, so decide whether to fix or accept again.
- Extend `backend/scripts/uat/seedUat.ts` (tested by `seedUat.test.ts`) per SRS §9.1:
  - Won deals; contracts in every status (including one ending in 25 days for UAT-7 and one suspended); instalments in every payment status, one Payment Pending due yesterday and one Not Invoiced due yesterday (UAT-3).
  - Activity for at least two salespeople over three months so every dashboard has figures and the 4 won / 6 lost example is reproducible (UAT-5, UAT-6).
  - `--deals 2000 --activities 5000 --contracts 500 --instalments 6000` for the performance check.
  - A sample signed contract PDF fixture (SRS §9.3).
- Measure on staging with `measure-performance.ts`: each dashboard, the performance screen and the contract and payment lists under 2 s at the NFR-PERF-04 volumes. Add or adjust indexes if one misses.
- Run the job tests (twice, two-day gap, failing notification) for expiry, reminders and overdue on the staging clock (NFR-REL-01).
- Device pass on Chrome desktop, Safari on iPhone and Chrome on Android for every M3 screen at 360 px (contract screens, Payments overview, Renewals, Performance, four dashboards, settings), and the `e2e-mobile` job green with the screens added in Slices 3–14 (NFR-USE-03).
- `npm run check:translations`; the notification texts and dashboard labels in sq and en; number formats checked in both languages (NFR-I18N-03).
- `node scripts/check-traceability.mjs --list`: every M3 Must ID is named in a test, and the remaining Should and Could warnings are reviewed (NFR-MNT-03).
- Migration rehearsal on a production copy (NFR-OPS-03): backup, the Float → Decimal conversion with its rounding report, the new payment default, existing contracts marked Legacy, the reminder marker replaced, `mysql_upgrade_to_current.sql` twice, `prisma migrate diff` shows no difference, counts and amounts reconcile to two decimals.
- Re-run Milestone 1 UAT-1..6 and Milestone 2 UAT-1..6 against the M3 build, including Reception seeing no sales data (UAT-7 step 4).
- Write `deploy/uat-milestone-3.md` in the format of `deploy/uat-milestone-2.md`: preparation, pre-flight checklist, UAT-1..7 with the seeded user per step, and a sign-off table.
- Replace placeholder seeds with Wellness Albania's real inputs if they have arrived: authorised payment users and a Finance role if wanted, lead times and grace days, standard contract terms text, dashboard definitions confirmation (section 5 below).

**Done when:** UAT-1 to UAT-7 pass on staging, run by the team, and the milestone is handed to Wellness Albania for sign-off.

---

## 5. Inputs needed from Wellness Albania, by slice

| Input (SRS §9.3) | Needed by | If late |
|---|---|---|
| Who the authorised payment users are, and whether a Finance role is wanted (Q3) | Slice 2, 8 | Administrator only; the Administrator creates a Finance role from the roles screen |
| Whether the platform only records invoices (Q4) | Slice 8 | Record only; number and date |
| Payment terms: when each instalment is due and how invoices are numbered | Slice 5, 8 | Due on the start date and each period after it (FR-PAY-02); free-text invoice number |
| Overdue treatment of uninvoiced instalments and grace days (Q12, Q13); partly paid past due reads Overdue (D7) | Slice 9 | Flag only; 0 grace days; Overdue per D7 |
| Standard commercial terms text for contracts, if different from the offer terms | Slice 4 | Offer terms text |
| Reminder lead times, expiring-soon window (Q6), and who else is reminded (Q7) | Slice 3, 11 | 60, 30, 7 days; 30 days; Sales Manager |
| Contract term editable at creation (Q1); billing period (Q2) | Slice 4, 5 | Pre-filled from the offer, editable while Draft; monthly |
| Signed document required for Active; no template generation (Q5) | Slice 5 | Required; no template |
| A sample signed contract (PDF) for testing the document upload | Slice 5, 15 | A generated test PDF |
| Extra services deal: separate contract (Q9) | Slice 4 | Separate contract |
| Revenue and conversion definitions, lead and pipeline value (Q10, Q11, Q14) | Slice 12, 13, 14 | SRS §5.3 definitions |
| Sales targets on dashboards (Q15) | — | None in Milestone 3 |
| Former client status rule (Q16) | Slice 7 | Automatic unless a renewal deal is open |
| Confirmation of the dashboard figures for each role | Slice 13, 14 | SRS §5.2 |

---

## 6. Traceability: requirement → slice

Together, the slices cover every requirement and UAT scenario in the Milestone 3 SRS. Where a requirement is split, the first slice listed adds its ID to `scripts/srs-requirements.json` (rule 1).

| Requirement | Slice(s) |
|---|---|
| FR-CON-01, 02, 04, 05, 06, 08, 09 | 4 |
| FR-CON-03 | 1 (dates and price calculation), 4 (use case) |
| FR-CON-07 | 1 (calculation), 4 (default and edit) |
| FR-CON-10 | 4 (Draft), 5 (after activation) |
| FR-CON-11 | 1 (table), 5 (server enforcement, 403s) |
| FR-CON-12, 13, 14, 15, 18, 19 | 5 |
| FR-CON-16 | 7 |
| FR-CON-17 | 7 (rule), 11 (Recently expired) |
| FR-CON-20 | 1 (rule), 6 (API) |
| FR-CON-21, 22 | 6 |
| FR-REN-01 | 3 (setting), 11 (reminders) |
| FR-REN-02, 03, 05, 08, 09, 11 | 11 |
| FR-REN-04 | 1 (rule), 3 (setting), 6 (badge) |
| FR-REN-06, 07, 10 | 10 |
| FR-PAY-01 | 5 |
| FR-PAY-02 | 1 (schedule), 5 (generation on activation) |
| FR-PAY-03, 04, 05, 08, 12 | 8 |
| FR-PAY-06, 07, 10 | 1 (domain), 8 (use cases, API) |
| FR-PAY-09 | 1 (rule), 3 (grace setting), 9 (job) |
| FR-PAY-11, 13, 14 | 9 |
| FR-DSH-01, 03, 04, 05, 06, 07, 08 | 13 (framework; reused in 14) |
| FR-DSH-02 | 13 (Sales User, Manager), 14 (Administrator, CEO) |
| FR-DSH-09, 10 | 13 |
| FR-DSH-11, 12, 13 | 14 |
| FR-PRF-01..10 | 12 |
| FR-RBAC-19, 20 | 2 |
| FR-RBAC-21 | 2 (lists, harness), 4 (contract fields), 6 (Reception shape), 8 (payment fields), 12 (performance values), 13 (dashboard values) |
| FR-RBAC-22 | 4 (contracts), 8 (instalments), 12–13 (Team = sales team) |
| FR-RBAC-23 | 12 (performance), 13, 14 (dashboards) |
| FR-RBAC-24 | 8 (payment writes), 5 (contract transitions), 14 (CEO read only) |
| FR-AUD-11 | 3 (settings), 4 (create), 5 (status, document), 8 (instalments), 10 (renewal link), 11 (not renewing) |
| FR-AUD-12 | 2 (filter group), registered by 3 |
| FR-AUD-13 | 9 (payments export), 12 (performance export) |
| NFR-ACC-03 | 1 (domain), 4 (schema conversion), 8 (instalment money) |
| NFR-ACC-04 | 12 (§6.2), 13 (§5.3 and example), 14 (CEO figures) |
| NFR-SEC-06 | 5, 6, 8 (every slice via rule 3 and 6); verified in 15 |
| NFR-REL-01 | 7 (helper, expiry), 9 (overdue), 11 (reminders); verified in 15 |
| NFR-DAT-01 | 4 (one contract per deal), 11 (one reminder per lead time) |
| NFR-PERF-04 | 9, 12, 13, 14 (queries and indexes); measured in 15 |
| NFR-USE-03 | every slice (rule 8); verified in 15 |
| NFR-I18N-03 | every slice (rule 8); verified in 15 |
| NFR-MNT-03 | every slice (rule 1); verified in 15 |
| NFR-OPS-03 | 4 (conversion), 11 (reminder marker); rehearsed in 15 |
| UAT-1 Won deal to active contract | 4, 5 |
| UAT-2 Payments | 8 |
| UAT-3 Overdue and contract summary | 9 |
| UAT-4 Reception checks validity | 5 (suspend), 6 |
| UAT-5 Dashboards | 13, 14 |
| UAT-6 Salesperson performance | 12 |
| UAT-7 Renewal, then Phase 1 end to end | 7, 10, 11; step 4 in 15 |
