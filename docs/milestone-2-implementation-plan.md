# Wellness Albania Platform — Milestone 2 Implementation Plan (slice-based)

| Item | Value |
|---|---|
| Source | `Wellness Platform - Milestone 2 SRS.docx` v0.1 (30.09.2026), `pricing-model.png`, `milestone-1-implementation-plan.md` |
| Scope | Milestone 2: Sales Process |
| Builds on | Milestone 1, as implemented on branch `m1-slice-15-hardening` |
| Approach | Vertical slices. Each slice is one branch (`m2-slice-N-<name>`) and one PR, with its own schema change, backend, frontend, translations and tests. At the end of each slice, something works that Wellness Albania can see or that a test proves. |
| Date | 30.09.2026 |

---

## 1. How to read this plan

Milestone 2 is split into **14 slices**. Together they cover every Must, Should and Could requirement in the SRS. Section 6 maps each requirement to its slice, and when a requirement is split across slices, the split is stated there and in each slice. Each slice lists:

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
| 1 | Money value object & pure price calculator | S | — | — (proves NFR-ACC-01) |
| 2 | Sales permissions, role upgrade & audit filter registry | M | — | UAT-6 (partial) |
| 3 | Pricing configuration | L | 1, 2 | UAT-5 step 2 |
| 4 | Services, packages & offer settings | M | 3 | — |
| 5 | Sales script panel & editor | M | 2 | UAT-5 step 1 |
| 6 | Deals & pipeline | L | 2 | UAT-2 step 1 |
| 7 | Activities upgrade & interaction migration | M | 6 | UAT-1 step 3 |
| 8 | Pricing screen & draft offer | L | 1, 3, 4, 6 | UAT-1 step 4 |
| 9 | Offer document: numbering, PDF, preview, versions, mark as sent | L | 8 | UAT-1 step 5, **UAT-5** |
| 10 | Discounts above the cap & approval | L | 9 | **UAT-3** |
| 11 | Follow-ups | M | 7 | UAT-1 step 6 |
| 12 | Sales calendar | L | 11 | **UAT-4** |
| 13 | Won & lost | M | 10, 11 | **UAT-1, UAT-2** |
| 14 | Milestone hardening & UAT readiness | M | all | **UAT-1..6 on staging** |

### 1.2 Dependency graph and parallel tracks

```
1 Money & calculator ──► 3 Pricing config ──► 4 Services & offer settings ──┐
                           ▲                                                  ▼
2 Permissions ─────────────┤                                     8 Pricing screen & draft offer
  │                        │                                          ▲            │
  ├──► 5 Sales script      └──────► 6 Deals & pipeline ───────────────┘            ▼
  │                                   │                              9 Offer document (PDF, numbers)
  │                                   ▼                                            │
  │                              7 Activities ─► 11 Follow-ups ─► 12 Calendar      ▼
  │                                                   │                    10 Discounts & approval
  │                                                   └────────────────────────┐   │
  │                                                                            ▼   ▼
  └──► (every slice: permission keys, audit types)                        13 Won & lost
                                                                               │
                                                                               ▼
                                                                         14 Hardening
```

With two developers, a workable split is:

- **Track A (money):** 1 → 3 → 4 → 8 → 9 → 10 → 13
- **Track B (workflow):** 2 → 5 → 6 → 7 → 11 → 12
- **Both:** 14

Slice 2 is small and first on Track B, because Slice 3 needs it. Slice 8 needs Slice 6, so Track B must merge 6 before Track A finishes 4. Slice 13 needs Slice 11 (winning closes open follow-ups). Track A carries more L slices; if it falls behind, Track B picks up Slice 13 after 12.

---

## 2. Cross-cutting rules (every slice)

The nine M1 rules still apply (M1 plan §2): TDD with the requirement ID in the test title, Clean Architecture, two schemas, tenant isolation, translations, audit in the same transaction, permissions instead of role names, 360 px, and no future-milestone behaviour. Milestone 2 adds:

1. **Requirement IDs at slice start (NFR-MNT-02).** The first commit of each slice adds that slice's IDs, and only those, to `scripts/srs-requirements.json`, with priority and requirement text copied from the M2 SRS. Adding an ID whose test comes in a later slice would fail the `traceability` CI job (`scripts/check-traceability.mjs`). When a requirement is split, the **first** slice that touches it adds it and names it in a test title. Update the file's `source` note to name both SRSs.
2. **Money is Decimal (NFR-ACC-02).** Amounts and percentages go through the `Money` and `Percent` value objects from Slice 1. New columns are `Decimal`, never `Float`. The API sends them as strings (`"49.40"`), and the frontend only formats them. The frontend never calculates a price.
3. **Commercial fields are redacted (FR-RBAC-17).** Every new money or percentage field name is added to `GUARDED_FIELDS` in `backend/src/access/domain/redactFields.ts` (under `commercial.view`) in the same slice that adds the field. Every new controller that returns deals, offers, pricing or approvals runs its responses through `redactFields`.
4. **New routes join the matrix.** Every new route declares its permission with `requirePermission` / `requireScope` (`backend/src/main/interfaces/http/middlewares/requirePermission.ts`), so `permissionMatrix.test.ts` and `routeCoverage.test.ts` (`backend/tests/integration/access/`) cover it automatically against `DEFAULT_ROLE_MATRIX` (NFR-SEC-04).
5. **New audit entity types are registered.** An entity type a slice starts auditing is added to `AUDITED_ENTITY_TYPES` (`backend/src/audit/domain/AuditQuery.ts`), and its filter group and label are added to the registry from Slice 2 in the same PR (FR-AUD-10). Every audited write uses the module's write-transaction port, with the audit trail inside it, as `PrismaContractWriteTransaction.ts` does (FR-AUD-09).
6. **Workflow guard.** Behaviour that differs for Wellness Albania from the generic quotation module is keyed on `Tenant.salesWorkflow` (D6), never on the tenant slug.
7. **Scheduler jobs are tenant-aware and time-zone aware.** New jobs iterate tenants as `AppointmentReminderJob.ts` does, and compute "today" and "due" in `Tenant.timezone` (Europe/Tirane for Wellness Albania), not UTC (FR-CAL-08).
8. **Mobile and translations.** Every new screen is added to the `screens` list in `frontend/tests/e2e/mobile360.spec.ts` in the slice that builds it (NFR-USE-02). Every new string, notification type, seeded list value and PDF label exists in `sq` and `en`, and `npm run check:translations` passes (NFR-I18N-02).
9. **Out of scope.** Do not build Milestone 3 behaviour: no contract from a won deal, no dashboards, no performance reports. Record the data they need (agreed values on the deal, stage history, activity counts) and stop there.

---

## 3. Decisions this plan takes (confirm or override)

The SRS leaves these open or asks the plan to decide. The plan assumes the answers below so that work can start. Changing an answer only changes the slices named.

| # | Decision | Assumed answer | Affects |
|---|---|---|---|
| D1 | Follow-ups vs Appointment (SRS §8 developer note) | **One scheduled-activity entity, made by evolving `Appointment` in place.** Add: `kind FOLLOW_UP\|PLANNED`, `type CALL\|EMAIL\|VISIT\|MEETING\|ONLINE_MEETING`, `endAt`, `place`, `dealId`, `contactPersonId`, `completedInteractionId`, `cancelReason`, `dueNotifiedAt`. `scheduledAt` stays the start or due time. Overdue is **derived** (open and `scheduledAt < now`), never stored, so it cannot go stale and needs no sweep job. Reschedule history reuses the existing `AppointmentAuditLog`. **Why:** the calendar becomes one scoped, indexed query (NFR-PERF-03 at 5,000 follow-ups), with one detail panel and one complete / reschedule / cancel flow. It reuses `appointmentAccess.ts`, the appointment routes, the reminder job and the timeline source. Keeping the table name avoids a data move on both databases. Merging two sources the way `TimelineMerger.ts` does would double the endpoints and make paging and "overdue today" span two queries. | 11, 12 |
| D2 | Where the risk surcharge lives, and the offer snapshot | **A separate `RiskSurcharge (tenantId, riskLevelId, percent)` table owned by the pricing module**, read through the pricing configuration. A risk level with no surcharge row gives "Price on request". **Why not a column on `RiskLevel`:** lookups are readable by every tenant user, including Reception, and are managed under `settings.manage`. A column there would leak a commercial number through `GET /lookups/risk-levels`, sit under the wrong permission (`pricing.manage`) and be audited as the wrong entity. **Snapshot:** typed `Decimal` amount columns on `Quotation`, plus two JSON columns. `pricingInputs` holds ids and the sq/en labels of employees, business type, risk level, city, area, zone, frequency, package and discount. `ruleSnapshot` holds `schemaVersion`, the band used, the risk %, frequency type and value, zone %, discount cap, contract months, validity days and currency. When the offer becomes Ready, the package's services, the company details and the offer texts are frozen into it as well. Decimals are stored as strings. | 3, 8, 9 |
| D3 | Offer PDF: pdfkit or HTML template | **Stay on pdfkit.** A pure `OfferDocument` view model is built in the application layer from the offer and its snapshot. `OfferPdfRenderer` only draws it: a registered TTF brand font (covers ë and ç), sq/en labels, a DRAFT watermark, and a small walker for TipTap JSON text. The browser preview is the same PDF served inline, so preview and download are identical by construction (FR-OFR-05). **Why:** the Hostinger deployment has no headless Chromium, the 3-second target (NFR-PERF-02) is easy for pdfkit, and the existing `QuotationPdfRenderer.ts` pattern is known. If Wellness Albania's final design needs HTML, only the renderer behind the view model changes (SRS §6 note). | 9 |
| D4 | Moving money to Decimal without breaking Float fields | **Add `decimal.js` and wrap it in domain value objects `Money` and `Percent`** (2 decimals, half-up), so the domain never imports Prisma. Every **new** column is `Decimal(12,2)` for money and `Decimal(7,2)` for percentages, in both schemas. The existing `Float` fields (`Product.price/cost`, `QuotationLineItem.unitPrice`, `Contract.amount`, `ContractPayment.amount/paidAmount`, `InvoiceLineItem.unitPrice`) **stay as they are**. Offer line items carry package services with no price, and offer totals live in the new Decimal columns. A schema test fails if a Milestone 2 model gets a `Float`. Converting contracts and payments to Decimal is recorded as Milestone 3 work, where payments are built. | 1, 3, 8 |
| D5 | Migrating existing interactions and quotation references | **Interactions (FR-ACT-07):** new columns are nullable; `occurredAt` is backfilled from `createdAt`; the channel keys MEETING, CALL, EMAIL and NOTE are already the new type keys, and VISIT and ONLINE_MEETING are added. Existing `OutcomeCategory` rows are copied into the new `ActivityResult` lookup, and `Interaction.resultId` is backfilled from `outcomeCategoryId`. The old column stays until Milestone 3. **Quotations (FR-OFR-08):** a new `DocumentSequence (tenantId, kind, year, next)` table is incremented under a row lock inside the create transaction. Existing quotations get numbers in `createdAt` order per tenant and year, `version 1`. Legacy quotations have no deal and stay read-only (`dealId` is nullable in the database; the domain requires it for new offers). No deals are invented for them. **Both (NFR-OPS-02):** a Postgres migration, a matching MySQL script folded into `mysql_upgrade_to_current.sql`, a backup before running, and a dry run on a production copy. | 7, 9, 14 |
| D6 | Turning off offer email, the public link and the old approval switch (FR-OFR-07, FR-RBAC-18) | **A workspace value `Tenant.salesWorkflow`: `LEGACY_QUOTATIONS` (default) or `SALES_PROCESS`.** It is set to `SALES_PROCESS` for Wellness Albania by migration and by `seed:wellness`. Under `SALES_PROCESS`: the public quotation routes return 404, quotation delivery email is off, approval depends on the discount cap and `discounts.approve` instead of `requiresQuotationApproval` and `quotations.approve`, and approving leads to `READY`, not `SENT`. **Why:** there is no feature-flag mechanism today, and one explicit, testable switch keeps the generic quotation module working for any other workspace. | 9, 10 |
| D7 | Adding the M2 permissions to existing roles without undoing customisation (FR-RBAC-16) | **An `AppliedPermissionUpgrade (tenantId, key, appliedAt)` ledger.** The upgrade `m2-sales` runs once per tenant. It inserts only the permission keys new in Milestone 2, only into system roles, and only with the §9.2 default for that role. It never updates or deletes an existing row. **Why:** the M1 generated seed (`backend/scripts/generate-role-seed-sql.ts`) inserts `WHERE NOT EXISTS`, so re-running it would put back a permission the Administrator had revoked. With the ledger, a revoke is never undone, a customised Reception keeps its customisation and gets nothing (its default has no sales keys), and copied roles are left to the Administrator. | 2 |
| D8 | "Price per employee": the SRS and the pricing table disagree | The pricing table's "Proposal Price per Person" is **base fee ÷ employees** (2 employees → €19.00). FR-PRC-10 says **list price ÷ employees** (Example A → €24.70). **The plan follows FR-PRC-10** on screen and on the offer. The calculator also returns `basePerEmployee`, so the table-driven test still checks every cell of that column. Wellness Albania to confirm. | 1, 8 |
| D9 | Who receives a discount approval request (FR-DSC-05, FR-DSC-09) | **Extend `NotificationService` with `toPermission: { key, subjectOwnerId }`.** It resolves every active user whose role holds the key at a scope that admits the salesperson (`recordScopeFor` in `backend/src/access/domain/RecordScope.ts`), minus the requester. `toRole` only knows the coarse `UserRole`, so it cannot express "Sales Manager, or the CEO when the Sales Manager asks". | 10, 11 |
| D10 | Rich text for the script and offer texts (NFR-SEC-05) | **Store TipTap JSON, not HTML.** Validate it against the whitelist `richTextDocSchema` in `backend/src/forms/interfaces/http/schemas/formSchemas.ts`, extended with a `link` mark whose `href` must be `http`, `https` or `mailto`. Anything else, including pasted HTML, goes through `sanitize-html` with an empty allow-list before it is parsed, so a `<script>` tag never reaches storage. Render with the structural `RichTextReadOnly.tsx`, which never uses `innerHTML`, and with the PDF walker, which ignores unknown nodes. | 4, 5 |
| D11 | Open questions Q1–Q14 | Build on the SRS's proposed default. The slice each question affects is named in that slice. Changing an answer is data or a small change in that slice. Q1 bands, Q3 Tiranë in two zones, Q4 levels 1/2/3, Q7 cap 10% → **3**; Q2 ad hoc €15 fixed per month → **1, 3**; Q5 VAT not included, Q6 12 months, Q9 30 days from sent, Q13 no "Wellness price per person" → **4, 9**; Q8 CEO approves a Sales Manager's discount → **2, 10**; Q10 free movement between open stages → **6**; Q11 package does not change the price → **4, 8**; Q12 calendar days, weekend → Monday → **11**; Q14 starting activity results → **7**. | as listed |

---

## 4. The slices

### Slice 1 — Money value object & pure price calculator

**Goal:** A pure domain service turns pricing inputs and a pricing configuration into a breakdown that reproduces every cell of Wellness Albania's pricing table and both SRS worked examples, to the cent. No database, no screen. The test proves it.

**Requirements:** NFR-ACC-01 · NFR-ACC-02 (domain part) · FR-PRC-07 (the calculation and "Price on request" rule), FR-PRC-08 · FR-PRC-10 (the calculation of price per employee and annual value) · Q2 (ad hoc as fixed €15.00 per month)

**Depends on:** —

**Backend**
- New module `backend/src/pricing/` with the M1 layering (`domain/`, `application/`, `infrastructure/`, `interfaces/http/`).
- Add `decimal.js` to `backend/package.json`.
- Domain value objects:
  - `Money`: EUR amount, 2 decimals, half-up rounding, `add`, `multiplyByPercent`, `divideBy`, `toString()` → `"49.40"`.
  - `Percent`: 0–1000 with up to 2 decimals, the FR-PCF-03 range. Reused by the discount % (0–100) in Slice 8.
- Domain types, no I/O:
  - `PricingConfig`: `bands[] {min, max, baseFee, perEmployeeFee}`, `riskSurcharges {riskLevelId → Percent}`, `frequencies {id → {type: PERCENT|FIXED, value}}`, `zones {id → Percent}`, `discountCap`, `contractMonths`.
  - `PricingInputs`: `employees, riskLevelId, frequencyId, zoneId`.
- `PriceCalculator.calculate(inputs, config)` returns one of:
  - `{ kind: 'PRICED', baseFee, riskFee, visitFee, locationFee, listPrice, pricePerEmployee, basePerEmployee, annualValue }`
  - `{ kind: 'PRICE_ON_REQUEST', reason: NO_BAND | NO_ZONE | NO_RISK_SURCHARGE }`
- Calculation rules:
  - Base fee `B = baseFee + perEmployeeFee × (employees − 1)`, using the band that covers `employees`.
  - Each surcharge is `B × %`, rounded half-up to the cent. A FIXED frequency adds its amount.
  - `listPrice` is the sum of the **rounded** components (FR-PRC-08).
  - `pricePerEmployee = listPrice ÷ employees` (D8).
  - `annualValue = listPrice × contractMonths`. For the net amounts, Slice 8 applies the same formula after the discount.
- `applyDiscount(listPrice, Percent)` returns `{discountAmount, netMonthlyPrice}`. The discount amount is rounded, and net = list − discount. It lives here so that Slices 8 and 10 share it.

**Tests**
- `PriceCalculator.test.ts`, table-driven, named `NFR-ACC-01 …`:
  - The fixture `pricingModelFigure1.ts` transcribes the PNG: 10 rows × {base, 3 risk cells, 6 frequency cells, 4 zone cells, per-person column}.
  - One `it.each` per column checks every cell: 10 × 14 = 140 component assertions.
  - A combined `it.each` covers all 10 × 3 × 6 × 4 = **720** combinations. The expected list price is the sum of the fixture's cells (SRS §4 developer note).
- Worked examples:
  - Example A: 2 employees, Medium, 2/year, Tirana centre → base 38.00, risk 3.80, location 0.00, visit 7.60, list **49.40**. With 10%: discount 4.94, net **44.46**. Per employee 24.70, annual 592.80.
  - Example B: 5 employees, High, Monthly, Kamëz → base 62.00, risk 12.40, location 18.60, visit 62.00, list **155.00**. With 10%: net **139.50**.
- 40 employees with only the 1–10 band → `PRICE_ON_REQUEST / NO_BAND` (FR-PRC-07). A missing zone → `NO_ZONE`.
- `Money` rounding: 0.005 → 0.01, 0.0049 → 0.00, and no float drift (`0.1 + 0.2`).

**Done when:** The 720-combination test and both worked examples pass in CI. This is the reference every later slice uses.

---

### Slice 2 — Sales permissions, role upgrade & audit filter registry

**Goal:** The roles screen shows the new "Sales" permissions. Every existing workspace receives the §9.2 defaults once, without losing the Administrator's M1 customisations. The audit log filter list comes from the backend, so each later slice only registers its entity type.

**Requirements:** FR-RBAC-15, FR-RBAC-16 · FR-RBAC-17 (redaction mechanism and Reception test harness) · FR-AUD-10 (registry; each slice adds its types) · NFR-SEC-04 (matrix expectations for new keys) · Q8

**Depends on:** —

**Data**
- `AppliedPermissionUpgrade (tenantId, key, appliedAt)`, primary key `(tenantId, key)` (D7).
- `Tenant.salesWorkflow String @default("LEGACY_QUOTATIONS")`. It is added here so that later slices can read it. Slice 9 sets it for Wellness Albania.

**Backend**
- `backend/src/access/domain/PermissionCatalogue.ts`: new group `sales`. New entries, all tagged `milestone: 'M2'`:

  | Key | Scoped |
  |---|---|
  | `script.view` | no |
  | `script.edit` | no |
  | `deals.view` | yes |
  | `deals.edit` (create, edit, change stage) | yes |
  | `deals.reopen` | yes |
  | `deals.delete` | yes |
  | `offers.edit` (create, edit, download) | yes |
  | `discounts.apply` (discount up to the cap) | yes |
  | `discounts.approve` | yes |
  | `followups.manage` | yes |
  | `activityResults.manage` (activity results and stage labels) | no |

  Move `commercial.view` and `pricing.manage` into the `sales` group, with labels as in the SRS.
- `DefaultRoleMatrix.ts` takes the §9.2 values:
  - `discounts.approve` goes to Sales Manager TEAM and CEO ALL (Q8), and **not** to the Administrator.
  - Calendar stays as M1 implemented it, including the documented Administrator deviation. An upgrade never removes a grant.
- The upgrade is defined once in `backend/src/access/domain/PermissionUpgrades.ts` (`m2-sales`: the keys new in Milestone 2). For every tenant with no ledger row for it, it inserts `RolePermission` rows for system roles whose key is not present, writes one `Role` audit entry per changed role from the system actor, then writes the ledger row.
  - It runs in the Postgres migration and the MySQL scripts as SQL generated by `generate-role-seed-sql.ts` (upgrade mode, guarded on the ledger). The M1 seed blocks are generated from `baselineRoleMatrix()` (the matrix without upgraded keys), so already-applied migrations stay byte-identical.
  - `PrismaSystemRoleSeeder.ts` seeds new tenants with the full matrix and writes the ledger row, so the upgrade never runs for them.
  - **As built:** there is no `ApplyPermissionUpgradeUseCase`. The migration is the only path that upgrades an existing tenant, so a use case would have no caller and would duplicate the SQL. `PermissionsChanged` is not needed either, because migrations run before the app starts and the access cache is empty.
- `redactFields.ts`: add the Milestone 2 field names to the `commercial.view` list as a single exported constant. Every later slice extends that constant and its test.
  - Initial names: `listPrice, netMonthlyPrice, discountAmount, discountPercent, baseFee, riskFee, visitFee, locationFee, annualValue, pricePerEmployee, agreedMonthlyPrice, agreedAnnualValue, requestedPercent, approvedPercent, surchargePercent`.
- Audit filter registry: `GET /audit/entity-types` returns the groups, each a list of entity types. It fixes the drift between the 8 types hard-coded in `frontend/src/services/auditService.ts` and the 14 in `AUDITED_ENTITY_TYPES`. It also fixes the missing `Workspace` label in `audit.json`. `SearchAuditEntriesUseCase` accepts a group, expanded server-side to its types. The initial groups are the M1 types; `Pricing`, `Offer`, `Deal`, `DiscountApproval` and `SalesScript` are added by the slices that create them.

**Frontend**
- `RolesSettingsContent.tsx`: the `sales` group renders with its heading (`roles.groups.sales`) and permission labels in `settings.json` (sq/en).
- `AuditLogContent.tsx` loads the filter options from the new endpoint.

**Tests**
- `FR-RBAC-15`: the catalogue exposes every §9.2 key under group `sales`, and `GET /roles` returns them.
- `FR-RBAC-16`: a tenant with a customised Reception keeps its customisation and gets no sales key. A system Sales User role gets the new keys at OWN. Running the upgrade twice changes nothing. After the Administrator revokes `deals.delete` from the Sales Manager, re-running does not restore it.
- `generateRoleSeedSql.test.ts` is extended so that the upgrade SQL matches the matrix.
- `permissionMatrix.test.ts` expectations update automatically from the matrix. The new keys have no routes yet, so this is a no-op until Slice 3.
- `FR-RBAC-17`: a shared test helper `expectNoCommercialFields(json)` asserts that none of the guarded names appear at any depth. Later slices call it for Reception.
- `FR-AUD-10`: the entity-type endpoint returns every type in `AUDITED_ENTITY_TYPES`, grouped. Filtering by group returns only that group's entries.

**Done when:** The Administrator sees the Sales permissions on the roles screen with the M2 defaults. A customised M1 role is unchanged after upgrade. The audit filter shows every audited type.

---

### Slice 3 — Pricing configuration

**Goal:** The Administrator manages every number in the pricing model from Settings → Pricing, sees active cities that are in no price zone, and tries the configuration in a test calculator. Every change is audited.

**Requirements:** FR-PCF-01, 02, 03, 04, 05, 07, 09 · FR-PCF-10 (rule: configuration changes never touch stored offers; proven in Slice 8) · FR-AUD-09 (pricing configuration, discount cap) · NFR-ACC-02 (schema) · Q1, Q2, Q3, Q4, Q7

**Depends on:** 1, 2

**Data** (all `Decimal`, all with `tenantId`, both schemas)
- `PricingSettings (tenantId PK, currency 'EUR', discountCapPercent Decimal(7,2) default 10)`. Slice 4 adds the offer settings to this row.
- `EmployeeBand (id, tenantId, minEmployees, maxEmployees, baseFee Decimal(12,2), perEmployeeFee Decimal(12,2), active)`.
- `RiskSurcharge (tenantId, riskLevelId, percent Decimal(7,2))`, unique on `(tenantId, riskLevelId)` (D2).
- `VisitFrequency (id, tenantId, nameSq, nameEn, visitsPerYear Int?, pricingType PERCENT|FIXED, value Decimal(12,2), order, active)`.
- `PriceZone (id, tenantId, nameSq, nameEn, surchargePercent Decimal(7,2), order, active)` and `PriceZoneCity (zoneId, cityId)`. A city may be in several zones (FR-PRC-06, Q3).
- Seed (`backend/src/lookups/domain/DefaultLookups.ts` style, for new tenants and for Wellness Albania by migration):
  - Band 1–10 at €30.00 + €8.00.
  - Risk level 1 → 0%, 2 → 10%, 3 → 20% (Q4).
  - Frequencies: 1/year 0%, 2/year 20%, 4/year 35%, 6/year 50%, monthly 100%, ad hoc fixed €15.00 (Q2).
  - Zones: Tirana centre 0% (Tiranë), Tirana suburbs 15% (Tiranë), Kamëz and Vorë 30%, Elbasan and Durrës 100%. Cities are matched by name against the M1 city seed.
  - Discount cap 10% (Q7).

**Backend**
- Domain rules:
  - Bands may not overlap (a clear error key).
  - `min ≤ max`, with `min ≥ 1`.
  - Fees ≥ 0 with 2 decimals; percentages 0–1000 with 2 decimals (FR-PCF-03, via `Money` and `Percent`).
  - A zone's cities must be active M1 cities.
  - Values in use are deactivated, never deleted. For frequencies and zones, "in use" means referenced by an offer (checked from Slice 8).
- Reuse the lookup framework where the shape fits. `VisitFrequency` and `PriceZone` are lookup-like lists with extra columns, registered through `LookupListRules` / `prismaLookupTables.ts`, but gated by `pricing.manage` instead of `settings.manage`. Bands, risk surcharges and the cap get their own small use cases.
- `LoadPricingConfigUseCase(tenantId)` builds the Slice 1 `PricingConfig` in one read. It is the only way the calculator gets its configuration (SRS §4 developer note).
- `GET /pricing/config` requires `pricing.manage`. `GET /pricing/zones-without-city` lists active cities in no zone (the FR-PCF-05 warning).
- `POST /pricing/test-calculation` requires `pricing.manage`, runs the Slice 1 calculator on the current configuration and stores nothing (FR-PCF-09).
- Audit: every create, update, (de)activation and zone-city change writes an entry with old and new values. The entity types are `EmployeeBand`, `RiskSurcharge`, `VisitFrequency`, `PriceZone` and `PricingSettings`, registered in the `Pricing` filter group (FR-AUD-09, FR-AUD-10).
- None of these values are readable without `pricing.manage`. Salespeople get what they need through the pricing screen's own endpoint in Slice 8.
- **As built:**
  - Pricing is its own module (`backend/src/pricing/`), not lookup lists. The lookup routes and use cases hard-code `settings.manage`, `GET /lookups/:list` is open to every user (the leak D2 avoids), and bands, surcharges and the cap have no label. Frequencies and zones reuse the lookup patterns and, on the frontend, `LookupListEditor`.
  - The warning route is `GET /pricing/cities-without-zone`.
  - FR-PCF-10 is added to `srs-requirements.json` in Slice 8, with the snapshot test; Slice 3 stores no offers to test it against.
  - `LoadPricingConfigUseCase` uses 12 contract months until Slice 4 adds the offer settings.
  - The M1 city seed had no Vorë. It is added to the Tiranë area (default list and migration) so the "Kamëz and Vorë" zone can be seeded.
  - A city in a price zone is in use: it can be deactivated, not deleted. A risk surcharge cascades with its risk level.
  - The discount cap is 0–100, not 0–1000.
  - API field names are distinctive so redaction by key is safe: `frequencyValue`, `riskSurchargePercent`, `discountCapPercent`, `perEmployeeFee` (added to `COMMERCIAL_FIELDS`).

**Frontend**
- Settings → Pricing, shown only with `pricing.manage`, with tabs:
  - Employee bands (table with overlap errors).
  - Risk surcharges (one row per M1 risk level, % input).
  - Visit frequencies (a `LookupListEditor` with pricing type and value columns).
  - Price zones (a `LookupListEditor` plus a city multi-select filtered by area, and a warning panel of cities in no zone).
  - Discount cap.
  - Test calculator (employees, risk level, frequency, zone → breakdown).

**Tests**
- Domain: overlapping bands refused (FR-PCF-01); negative, non-numeric and three-decimal values refused (FR-PCF-03).
- Integration:
  - Adding band 11–50 makes 30 employees priceable in the test calculator (FR-PCF-01).
  - Medium 10% → 12% changes the next calculation (FR-PCF-02).
  - A new frequency "3 per year, 28%" is returned immediately (FR-PCF-04).
  - The seeded zones exist, and a city in no zone is listed (FR-PCF-05).
  - Cap 10 → 15 is returned by the config (FR-PCF-07).
  - Example A in the test calculator gives 49.40 (FR-PCF-09).
  - Every write creates one audit entry in the same transaction (FR-AUD-09).
  - Reception and Sales User get 403 on every `/pricing` admin route (NFR-SEC-04, via the generated matrix).
- `NFR-ACC-02`: a schema test parses `schema.prisma` and `schema.mysql.prisma` and fails if any model in an M2 allow-list has a `Float` field.
- The `mysql` CI job runs the upgrade twice with no drift.

**Done when:** UAT-5 step 2 works on the settings side: the Administrator changes Medium to 12% and adds a city to a zone, and both changes appear in the audit log. The test calculator shows €49.40 for Example A under the seeded values.

---

### Slice 4 — Services, packages & offer settings

**Goal:** The Administrator manages the services and packages described on the offer, plus the offer settings: validity, contract length, number prefix, Wellness Albania's company and bank details, and the standard texts in sq and en.

**Requirements:** FR-PCF-06, FR-PCF-08 · NFR-SEC-05 (offer texts) · FR-AUD-09 (services, packages, offer settings) · Q5, Q6, Q9, Q11, Q13

**Depends on:** 3

**Data**
- `Service (id, tenantId, nameSq, nameEn, descriptionSq, descriptionEn, order, active)`.
- `ServicePackage (id, tenantId, nameSq, nameEn, descriptionSq, descriptionEn, isDefault, order, active)`, and `PackageService (packageId, serviceId, order)`. Exactly one active package is the default.
- `PricingSettings` gains:
  - `offerValidityDays` (30, Q9), `contractMonthsDefault` (12, Q6), `offerNumberPrefix` ("OF").
  - Company details: `companyName, nipt, address, phone, email, website, bankDetails`.
  - Texts: `introSq/En, termsSq/En, closingSq/En` (TipTap JSON, D10). The terms seed includes "VAT not included" / "TVSH nuk përfshihet" (Q5).
- Seed placeholder services and one "Standard" package until Wellness Albania's list arrives (SRS §11.3).

**Backend**
- Services and packages reuse the lookup framework pattern, gated by `pricing.manage`. A package must contain at least one active service. Deactivating a service in an active package asks for confirmation.
- The rich-text sanitiser from D10 is a shared `backend/src/shared/application/richText/` module: the extended `richTextDocSchema`, the `sanitize-html` pre-pass and the link `href` rule. It is used here and in Slice 5.
- `UpdateOfferSettingsUseCase`: validation (validity 1–365 days, contract months 1–60, prefix `[A-Z]{1,6}`) and audit with old and new values.
- `GET /pricing/packages/active` is readable with `offers.edit`, for the pricing screen. The admin routes need `pricing.manage`.
- Packages do not change the price in Milestone 2 (Q11). The package is a description only, and the calculator does not see it.
- **As built:**
  - Services and packages are two more pricing lists (`/pricing/services`, `/pricing/packages`), not lookup lists, for the reasons given under Slice 3. The generic create, edit, reorder, (de)activate and delete use cases serve them. A package is created with its services by its own use case (`POST /pricing/packages`). Its ordered services (`PUT /pricing/packages/:id/services`) and the default flag (`POST /pricing/packages/:id/default`) have their own routes, as a zone's cities do.
  - `ensureListRulesKept` (`pricingAdmin.ts`) holds the rules between the two lists:
    - The default package cannot be deactivated or deleted until another package is the default.
    - No active package is left without an active service.
    - A service in a package can be deactivated but not deleted (409, naming the packages).
    - The frontend asks before it deactivates a service that active packages hold.
  - `PackageService` cascades from its `Service` instead of restricting. Deleting a workspace cascades to `Service` and `ServicePackage` in no fixed order. Postgres checks a RESTRICT or NO ACTION key inside each cascade step, so it would refuse the delete. The delete use case enforces the in-use rule instead.
  - The shared sanitiser (`backend/src/shared/application/richText/sanitizeRichText.ts`) has its own whitelist rather than an extended `richTextDocSchema`: paragraphs, headings, lists, line breaks, bold, italic and links. The form TEXT component's whitelist is unchanged.
    - A link that is not an absolute http, https or mailto address loses the link and keeps its text.
    - A string is treated as pasted HTML and reduced to its text.
    - `sanitize-html` is pinned to 2.17.5, the last release whose `htmlparser2` still ships CommonJS for ts-jest.
  - The frontend editor is a new `RichTextField` (`frontend/src/components/ui/RichTextField/`) on `DOCUMENT_TEXT_EXTENSIONS`, not the forms canvas `RichTextEditor`. The canvas editor has a slash menu, canvas focus handling and no undo. The link is StarterKit v3's bundled extension, limited to http, https and mailto. `RichTextReadOnly` renders links on the same rule. Slice 5 reuses all three.
  - The migrations set the company name to the workspace name. The MySQL script seeds the offer settings only on the run that adds their columns, so a second run never refills a value the Administrator cleared.
  - `LoadPricingConfigUseCase` takes the contract months from the offer settings, so the test calculator's annual value follows them.
  - `GET /pricing/packages/active` (`offers.edit`) returns active packages, default first, each with its active services in order. It carries labels and descriptions only.

**Frontend**
- Settings → Pricing gains three tabs:
  - Services (`LookupListEditor` with description fields).
  - Packages (services multi-select with order, default radio).
  - Offer settings (number fields; company details; three `RichTextEditor` instances per language, using the registry editor with bold, italic, lists and links).
- Add the TipTap Link extension to `frontend/src/components/forms/registry/richTextExtensions.ts` (shared with Slice 5).

**Tests**
- `FR-PCF-06`: a package with three services returns them in order; a package with no active service is refused.
- `FR-PCF-08`: changing validity to 15 is stored and audited. The FR-OFR-10 effect (a new offer expires 15 days after being marked as sent) is tested in Slice 9.
- `NFR-SEC-05`: offer terms submitted as HTML containing `<script>alert(1)</script>` and a `javascript:` link are stored without the script and without the link.
- Every write is audited, in the `Pricing` group.

**Done when:** The Administrator can fill in every offer setting and package, and a sanitiser test proves script input is stripped.

---

### Slice 5 — Sales script panel & editor

**Goal:** A "Sales script" button opens a side panel that stays open, at the same scroll position, while the salesperson moves between pages and types in forms. The Administrator edits the script in sq and en, previews it and publishes it, and every publish is a version.

**Requirements:** FR-SCR-01, 02, 03, 04, 05, 06, 07, 08 · NFR-SEC-05 (script) · FR-AUD-09 (script publishes) · NFR-USE-02 (panel at 360 px)

**Depends on:** 2

**Data**
- `SalesScript (id, tenantId, version Int, contentSq Json, contentEn Json?, status DRAFT|PUBLISHED|SUPERSEDED, createdByUserId, publishedAt?, publishedByUserId?)`.
  - At most one DRAFT and one PUBLISHED per tenant, enforced in the use case and by a partial unique index where the database allows it. On MySQL this is a generated column plus a unique index.
  - Seed a placeholder script with the SRS section headings (Opening, Needs discovery, Pricing questions, Objections, Closing) until the real text arrives (SRS §11.3).

**Backend**
- New module `backend/src/salesScript/`.
- `GetPublishedScriptUseCase(lang)` requires `script.view`. It returns the section headings (the H2 nodes, with anchors) and the content. English falls back to Albanian when `contentEn` is empty (FR-SCR-04).
- `SaveScriptDraftUseCase` requires `script.edit` and runs the D10 sanitiser on both languages. `PublishScriptUseCase` marks the draft PUBLISHED and the previous version SUPERSEDED, and writes an audit entry (`SalesScript`, `STATUS_CHANGE`) in the same transaction (FR-SCR-05).
- `ListScriptVersionsUseCase` returns version, author and date. `RestoreScriptVersionUseCase(version)` copies an old version into a new draft (FR-SCR-06).
- Routes: `GET /sales-script` (`script.view`); `GET /sales-script/draft`, `PUT /sales-script/draft`, `POST /sales-script/publish`, `GET /sales-script/versions`, `POST /sales-script/versions/:v/restore` (`script.edit`). A Sales User calling an edit route gets 403 (FR-SCR-07).

**Frontend**
- `SalesScriptProvider` at layout level, mounted in `components/layout/AppLayout/AppLayout.tsx` above the router outlet. It holds open/closed state and scroll position, so the panel survives route changes (SRS developer note). This is the first layout-level panel. `AppointmentDetailPanel` keeps its local state.
- `SalesScriptPanel` in `frontend/src/components/panels/`:
  - It is a non-modal right-side panel on desktop, so it does not block the form underneath, unlike the modal `SlideOver`. It opens full screen with a close button below 768 px.
  - A section list at the top scrolls to each heading (FR-SCR-03).
  - A search box highlights matches in the rendered text (FR-SCR-08). Highlighting walks the rendered DOM text nodes; the content is not re-parsed.
  - Content is rendered by `RichTextReadOnly.tsx`.
- The button sits in the application header next to `NotificationBell` (`AppLayout.tsx:103`), wrapped in `<Can permission="script.view">`. The company page gets the button from this slice; the deal page (Slice 6) and the pricing screen (Slice 8) add it when they are built (FR-SCR-01).
- Settings → Sales script (`script.edit`): sq/en tabs with `RichTextEditor` (headings, bullets, numbered lists, bold, italic, links), a preview that uses the panel renderer, Save draft, Publish, and a version list with Restore.

**Tests**
- Backend:
  - `FR-SCR-03`: two Sales Users get identical content and the heading list.
  - `FR-SCR-04`: saving a draft does not change what `GET /sales-script` returns; publishing does. An empty English text falls back to Albanian.
  - `FR-SCR-05`: publish writes one audit entry, and the version list shows the author.
  - `FR-SCR-06`: restoring version 2 creates a draft equal to version 2.
  - `FR-SCR-07`: a Sales User gets 403 on `PUT /sales-script/draft`.
  - `NFR-SEC-05`: `<script>` is stripped from the stored script.
- Frontend (Vitest):
  - `FR-SCR-01`: the button is rendered for `script.view` and not for Reception.
  - `FR-SCR-02`: with the panel open, a route change keeps it open and at the same `scrollTop`.
  - `FR-SCR-08`: searching "çmim" marks the matches.
- e2e: open the panel on the company page, navigate to another page, type in a field, and assert the panel is still visible. Add the panel-open state to the 360 px suite.

**Done when:** UAT-5 step 1 passes (the Administrator publishes and a salesperson sees the new text), and UAT-1 step 2 can be demonstrated (the panel stays open during navigation).

**As built:**
- **One draft and one published version** use no partial index or generated column; neither schema has one anywhere else.
  - `SalesScript.liveSlot` repeats the status while a row is DRAFT or PUBLISHED, and is NULL once SUPERSEDED.
  - `@@unique([tenantId, liveSlot])` then allows one of each per tenant on both databases, because a unique index ignores NULLs. Prisma models it natively.
  - A racing second draft or publish gets a P2002 error, which is answered with 409 `SALES_SCRIPT_CONFLICT`.
- **The placeholder script** (`salesScript/domain/DefaultSalesScript.ts`) is published as version 1 for every workspace.
  - New workspaces get it from `PrismaSalesScriptSeeder`, which is a provisioning repo.
  - Existing workspaces get it from migration `20261001120000_m2_sales_script` and `mysql_migration_m2_sales_script.sql`, which is step 21 of `mysql_upgrade_to_current.sql`.
  - `DefaultSalesScript.test.ts` keeps these three sources in step.
- **Sections:**
  - Section anchors are positional (`section-<n>`, counting top-level H2s), never derived from titles. The sanitiser keeps heading `attrs` to `level`, so anchors are computed when the script is read.
  - The frontend numbers H2s the same way. Its `scriptSections` copy only serves the unpublished preview.
- **Routes:**
  - Besides the planned routes, `GET /sales-script/versions/:version` lets the Administrator view an earlier version (FR-SCR-05).
  - Restoring overwrites an existing draft rather than refusing.
  - A draft with an empty Albanian text can be saved but not published (400 `SCRIPT_EMPTY`).
- **Audit:**
  - Each publish is one `STATUS_CHANGE` entry on entity `SalesScript`. Its `entityId` is the tenant, so the script's history reads as one record. Its label is `v<n>`.
  - The changes are the version number plus whichever language texts changed, as plain text. Draft saves and restores are not audited.
  - `SalesScript` has its own filter group, `salesScript`.
- **Panel placement:** there is no `SalesScriptProvider` in AppLayout, because every page mounts its own AppLayout.
  - The panel is mounted once in `TenantGuard`, the only route element that stays mounted across pages, so its DOM and scroll position survive navigation.
  - Open/closed state lives in `useSalesScriptStore`, which is reset on sign-out.
  - From 1024 px, `AppLayout` adds a right margin so the panel never covers the page. Between 768 and 1023 px it overlays the right edge. Below 768 px it is full screen.
- **Search:** done in React (`RichTextReadOnly`'s `highlight` prop and `utils/textMatches.ts`), not by walking the DOM.
  - It ignores case and diacritics: "cmim" finds "çmim".
  - A match that crosses a formatting boundary (for example, half bold) is not found.
- **Editor:** `RichTextField headings` uses `SCRIPT_TEXT_EXTENSIONS` (H2 and H3). The offer texts keep `DOCUMENT_TEXT_EXTENSIONS`.
- **End-to-end tests:** `tests/e2e/salesScript.spec.ts` runs in a new `desktop` Playwright project that depends on the admin `setup`. The 360 px pass covers the settings page and the open panel.

---

### Slice 6 — Deals & pipeline

**Goal:** A company can have several deals. Salespeople see their deals on a pipeline board and in a filtered list, move them between open stages (by drag on desktop, by "Move to stage" on a phone), and every stage change is recorded. Stage labels reuse the M1 status-label admin screen.

**Requirements:** FR-DEAL-01, 02, 04, 05, 06, 07, 09, 10, 11, 13, 19, 20 · FR-DEAL-03 (the page; later slices add their sections) · FR-RBAC-17 (deals) · FR-AUD-09 (deal salesperson change, delete) · NFR-PERF-03 (board part) · Q10

**Depends on:** 2

**Data**
- `Deal`:
  - Fields: `id, tenantId, clientId, ownerUserId, type NEW_CONTRACT|RENEWAL|EXTRA_SERVICES, title, stageKey, expectedCloseDate?, notes?, createdAt, updatedAt, closedAt?, deletedAt?`.
  - Columns filled in Slice 13: `wonAt?, lostAt?, lostReasonId?, lostNote?, agreedMonthlyPrice Decimal(12,2)?, agreedAnnualValue Decimal(12,2)?, packageId?, wonQuotationId?`. They are added now so that the table is created once.
  - Indexes: `(tenantId, ownerUserId, stageKey)`, `(tenantId, clientId)`, `(tenantId, stageKey, updatedAt)`.
- `DealStageHistory (id, tenantId, dealId, fromStage?, toStage, changedByUserId? (null = automatic), at, note?)`, indexed on `(tenantId, dealId, at)`.
- `StatusLabel` gains domain `DEAL` (the column is a string, so there is no migration beyond the catalogue).

**Backend**
- `backend/src/statuses/domain/StatusCatalogue.ts`:
  - Add `StatusDomain.Deal = 'DEAL'` with the fixed keys `NEW_LEAD, CONTACTED, INTERESTED, OFFER_PREPARED, OFFER_SENT, FOLLOW_UP, NEGOTIATION, WON, LOST`, their sq/en labels, colours and order (FR-DEAL-06).
  - `ListStatusLabelsUseCase` merges overrides as it does today. The status-label routes accept `deal`. Editing deal labels needs `activityResults.manage` or `settings.manage`, per the §9.2 row "Activity results, stage labels: manage".
- New module `backend/src/deals/`:
  - Domain entity `Deal` with the stage rules:
    - `moveTo(stage)` is allowed between open stages in any direction (Q10). It refuses WON and LOST, which have their own actions in Slice 13 (FR-DEAL-07).
    - `advanceAutomatically(target)` only moves forward in the fixed order and never out of a closed stage. It is used by Slices 7, 8, 9 and 11 (FR-DEAL-08).
    - Every change produces a `DealStageHistory` record (FR-DEAL-09).
  - Use cases: `CreateDeal` (default title "<company> – <type>", default owner the company's salesperson), `UpdateDeal`, `ChangeDealStage`, `ReassignDeal` (needs `companies.reassign`, audited with old and new owner, FR-DEAL-05), `DeleteDeal` (soft delete, needs `deals.delete`, refused once an offer has been sent — the check is wired in Slice 9, FR-DEAL-19, audited), `GetDeal`, `SearchDeals`, `GetPipelineBoard`.
  - Scope: `deals.view` / `deals.edit` on `ownerUserId` through `recordScopeFor` and `ownerWhere` (`backend/src/access/infrastructure/prismaRecordScope.ts`). A deal outside scope returns 404 (FR-DEAL-04). Reception holds no `deals.*` key, so it gets 403 on the routes, and deals are missing from its company responses.
  - `CreateClientUseCase` accepts `createDeal: true` and creates a New Lead deal in the same transaction (FR-DEAL-02).
- Board query (FR-DEAL-10):
  - One grouped query returns per-stage counts and total value, and one query per column returns the first 50 cards, with cursor paging per column.
  - Won and Lost columns show this month only.
  - Card value is the net monthly price of the latest offer. It is null until Slice 8, and it is redacted without `commercial.view`.
  - The next follow-up date is null until Slice 11.
- List (FR-DEAL-11): filters by salesperson, stage, type, business type, area, city, expected close date and value range; sort; pagination in the query (M1 FR-RBAC-13 pattern).
- Timeline (FR-DEAL-20): a new `DealTimelineSource` in `backend/src/clients/infrastructure/timeline/companyTimelineSources.ts`, category `DEAL` (the comment in `TimelineEntry.ts` already reserves it), permission `deals.view`, events `DEAL_CREATED` and `DEAL_STAGE_CHANGED`. `DEAL_WON` and `DEAL_LOST` come in Slice 13. The category is hidden in `CompanyTimeline.tsx` without `deals.view`.
- `PrismaLookupInUsePolicy.ts`: `LostReason` in-use now counts deals (it returned 0 "until Milestone 2").
- Audit entity type `Deal` in the `Deal` filter group.

**Frontend**
- `frontend/src/pages/deals/`:
  - `PipelineBoardContent`: columns from the DEAL status labels (label and colour from `useStatusLabels`); header with count and total value. Drag and drop uses native HTML5 drag, since no drag library is in the bundle today. A card menu offers "Move to stage", and it is the only way on touch. At 360 px the board scrolls horizontally inside its own container, so the page itself has no horizontal scroll (FR-DEAL-13).
  - `DealListContent` with filter chips.
  - `DealDetailContent` (FR-DEAL-03): company, contacts, stage, value, stage history, notes and the sales script button. The offers, activities and follow-ups sections are placeholders that Slices 7, 8, 9 and 11 fill.
  - `DealFormContent`.
- `ClientFormContent.tsx`: a "Create a deal" checkbox. `ClientDetailContent.tsx`: a Deals tab next to timeline, appointments and contracts.
- `useNavigation.ts`: a "Pipeline" item gated by `deals.view`.
- `StatusesSettingsContent.tsx`: add `deal` to the hard-coded domain list (line 13).

**Tests**
- Domain (`Deal.test.ts`):
  - `FR-DEAL-07`: Negotiation → Follow-Up is allowed; WON through `moveTo` is refused.
  - `FR-DEAL-08`: `advanceAutomatically` never moves backwards.
  - `FR-DEAL-09`: every change records its history.
- Integration:
  - `FR-DEAL-01`: a company with two deals, one of them closed.
  - `FR-DEAL-02`: creating a company with a deal.
  - `FR-DEAL-04`: Sales User A gets 404 for B's deal; the Manager sees both.
  - `FR-DEAL-05`: reassignment is audited with old and new values.
  - `FR-DEAL-06`: renaming INTERESTED changes the label, and the key stays the same.
  - `FR-DEAL-10`: the column totals change after a move.
  - `FR-DEAL-11`: filtering by salesperson.
  - `FR-DEAL-19`: a soft delete is audited and the deal disappears from lists.
  - `FR-DEAL-20`: the timeline shows `DEAL_CREATED` and the stage change.
  - `FR-RBAC-17`: Reception's company response has no `deals` and passes `expectNoCommercialFields`.
- Frontend: `FR-DEAL-13`: the card menu moves a deal. The board and the deal page are added to the 360 px suite.
- Performance: `measure-performance.ts` gains a board scenario with 2,000 open deals (measured on staging in Slice 14).

**Done when:** UAT-2 step 1 passes: a second deal is created and moved to Negotiation from the board or the card menu, and the stage history shows it.

**As built:**
- **Data:**
  - `Deal.type` is a String column, like every other status in the schema.
  - `title` is nullable. NULL means the default "<company> – <type>", which the frontend renders in the reader's language.
  - `ownerUserId` is NOT NULL.
  - Slice 13's columns exist already, with RESTRICT keys to `LostReason`, `ServicePackage` and `Quotation` (relation `DealWonQuotation`).
  - `DealStageHistory.changedByUserId` is RESTRICT, so a NULL always means "automatic".
  - Migration `20261001140000_m2_deals`; `mysql_migration_m2_deals.sql` is step 22 of `mysql_upgrade_to_current.sql`.
  - Checked locally: no drift on Postgres; the CI MySQL steps pass on MySQL 8.0.
- **Stages:** `deals/domain/DealStage.ts` holds the keys, and `StatusCatalogue` mirrors them as domain `DEAL`. Status-label writes for `deal` accept `settings.manage` or `activityResults.manage`; contract and payment still need `settings.manage`.
- **Salesperson:**
  - The default is the company's salesperson if active, otherwise the creator.
  - Naming anyone else needs `companies.reassign`.
  - The salesperson must be an active user that the chooser's `deals.edit` scope (on create) or `companies.reassign` scope (on reassign) reaches.
- **Company response:** deals are not embedded. The company page's Deals tab calls `GET /deals?clientId=`. The company response now goes through `redactFields` as well.
- **Audit:** reassign (`UPDATE`, `ownerUserId` old → new) and delete (`DELETE`) on entity `Deal`, group `deals`. The label is the title, or "<company> – <Albanian type>". Stage changes are history only.
- **Board:**
  - `GET /deals/board` returns 9 columns, each with `count`, `totalNetMonthlyPrice: null`, up to 50 cards and `nextCursor`.
  - `GET /deals/board/column?stage=&cursor=` returns the next page. The cursor is (updatedAt, id), descending.
  - Won and Lost count `closedAt` from the first of the month in `Tenant.timezone`.
  - One use case, `GetPipelineBoardUseCase`, serves both routes.
  - The frontend orders columns by the stage labels' order.
- **List:** filters by `ownerUserId, stage, type, businessTypeId, areaId, cityId, expectedCloseFrom/To, q`; sorts by `updatedAt | createdAt | expectedCloseDate | title`; at most 100 per page. **The value filter and the value sort are deferred to Slice 8**: until offers exist, every value is null.
- **Delete:** a soft delete only. The "no sent offer" refusal comes in Slice 9.
- **Timeline:** `PrismaDealTimelineSource` (category `DEAL`, `deals.view`) skips the first history row, since the creation is its own entry, and leaves out deleted deals. The permission is checked against the company's salesperson, as for every other source.
- **Lookups:** `LostReason` in-use counts deals. `FollowUpInterval` stays 0 until Slice 11.
- **Frontend:**
  - Routes: `pipeline` (board), `pipeline/list`, `deals/new`, `deals/:dealId` and `deals/:dealId/edit`, all inside one `DealsPage` shell.
  - Drag uses native HTML5 drag and drop. "Move to stage" uses `DropdownMenu`.
  - The `deals` namespace has strings in sq and en only; `el` and `it` fall back to English.
- **Seeds and performance:**
  - `seed:uat` gives each company of Sales User A and B a New contract deal, and `--deals N` seeds bulk open deals.
  - `perf:staging` gives each query its own budget, with the board and the list at 2 s.
  - Local run, 2,004 deals: the board's p95 was 44 ms. The staging measurement is still Slice 14's.
- **Tests:** `tests/e2e/pipeline.spec.ts` (UAT-2 step 1) runs in the `desktop` Playwright project, which CI does not run.

---

### Slice 7 — Activities upgrade & interaction migration

**Goal:** Salespeople record calls, emails, visits, meetings, online meetings and notes with the time they happened, the contact person, a result from a managed list, the client's feedback and the next action, optionally linked to a deal. Every existing interaction still appears, now as an activity.

**Requirements:** FR-ACT-01, 02, 03, 05, 06, 07 · FR-DEAL-08 (first activity on a New Lead → Contacted) · FR-DEAL-03 (activities section) · NFR-OPS-02 (interactions) · FR-AUD-09 (activity results) · Q14

**Depends on:** 6

**Data**
- `Interaction` gains nullable columns: `occurredAt, contactPersonId, dealId, resultId, clientFeedback Text, nextAction Text, updatedAt, updatedByUserId`. Index `(tenantId, dealId, occurredAt)`.
- `ActivityResult`: a new lookup list (`id, tenantId, nameSq, nameEn, order, active`), added to `LookupList.ts` and `prismaLookupTables.ts` and gated by `activityResults.manage`. Seed: Reached – interested, Reached – not interested, Not reached, Call back later, Meeting agreed, Offer requested (Q14).
- Migration (D5, FR-ACT-07):
  - `UPDATE Interaction SET occurredAt = createdAt`.
  - Insert one `ActivityResult` per existing `OutcomeCategory` label, then set `resultId` through the label.
  - `outcomeCategoryId` stays.
  - It is written for Postgres and MySQL, is idempotent, and the row counts before and after are logged.

**Backend**
- `backend/src/clients/domain/enums/InteractionChannel.ts`: add `VISIT` and `ONLINE_MEETING`.
- `AddInteractionUseCase`:
  - Every type except NOTE requires `occurredAt` (default now, may be in the past, not in the future), `contactPersonId` (a contact of the same company) and `resultId` (active) (FR-ACT-02). `dealId` must be an open deal of the same company (FR-ACT-01).
  - After saving, it calls `deal.advanceAutomatically(CONTACTED)` if the deal is in NEW_LEAD (FR-DEAL-08).
  - The permission split per channel stays as it is (`activities.add` / `notes.add`, M1 D3).
- `UpdateInteractionUseCase` (new, FR-ACT-06): the author may edit within 24 hours; after that only a holder of `activities.add` at TEAM scope or wider can. There is no delete route for Sales Users.
- Read models: `GET /deals/:id/activities` and the company timeline entry carry type, `occurredAt`, user, contact, result and next action (FR-ACT-05). The timeline sorts activities by `occurredAt`, not `createdAt`.
- The old `/settings/outcome-categories` route stays read-only for one milestone, and the admin UI moves to Settings → Lists → Activity results. `OutcomeCategory` is audited as `ActivityResult` from now on.

**Frontend**
- The activity dialog replaces the interaction `SlideOver` in `ClientDetailContent.tsx` (lines 429-438):
  - Type buttons for all six types, date and time, a contact select (company contacts), a result select, feedback, next action and notes, and an optional deal select.
  - It opens from the company page and the deal page, and `?logInteraction=<channel>` keeps working.
- The deal page activities section. `CompanyTimeline.tsx` shows the new fields and icons for VISIT and ONLINE_MEETING.
- Settings → Lists → Activity results, using `LookupListEditor`.

**Tests**
- `FR-ACT-01`: each of the six types can be recorded.
- `FR-ACT-02`: a Call without a contact or result gives a translated validation error.
- `FR-ACT-03`: a new result is selectable immediately, and the write is audited.
- `FR-ACT-05`: a call appears on the company timeline and on the deal, newest first by `occurredAt`.
- `FR-ACT-06`: a Sales User cannot edit an activity older than 24 hours; the Sales Manager can.
- `FR-ACT-07` and `NFR-OPS-02`: on a fixture with legacy interactions and outcome categories, the migration keeps every row (same count), every row has `occurredAt = createdAt`, and results are mapped. The same script runs in the `mysql` CI job.
- `FR-DEAL-08`: the first activity on a New Lead moves the deal to Contacted; a deal in Negotiation stays there.

**Done when:** UAT-1 step 3 passes, and every existing interaction still appears in the company timeline after the migration.

**As built:**
- **Data:**
  - Every new `Interaction` column is nullable, as D5 says. Contact, deal and result keys are RESTRICT: contacts and deals are only soft-deleted, and a result in use cannot be deleted. `updatedAt` NULL means never edited.
  - `ActivityResult` copies `LostReason`. `nameEn` is nullable, like every other list.
  - Migration `20261002100000_m2_activities`; `mysql_migration_m2_activities.sql` is step 23 of `mysql_upgrade_to_current.sql`.
  - The data step only seeds a workspace that has no activity results yet. It adds the six defaults, then every outcome-category label that is not one of them, keeping the category's id, so interactions map by key. Legacy rows (no `occurredAt`) get their result first and `occurredAt = createdAt` last. Row counts are logged before and after.
  - Checked locally: no drift on Postgres or MySQL 8.0, and three MySQL upgrade runs.
- **Migration tests:**
  - Postgres: `interactionMigration.test.ts` replays the data statements on planted legacy rows inside a rolled-back transaction.
  - MySQL: the CI job plants legacy interactions (`prisma/ci/`) between its two upgrade runs and fails on any `FAIL` from the check script.
- **Permissions:**
  - Activity-result writes accept `settings.manage` or `activityResults.manage` (`lookupAdmin.ts`, `ensureCanManageList`); every other list stays `settings.manage`.
  - The frontend opens Settings → Lists for either key. A role with only `activityResults.manage` sees just that list.
- **Recording (FR-ACT-01, 02):**
  - A refused field returns 400 `INVALID_ACTIVITY` with `field`. A time up to one minute ahead is accepted as clock skew.
  - A note needs its text only; an activity's text is optional.
  - The linked deal must be a live, open deal of the same company within the caller's `deals.view` scope.
- **First activity (FR-DEAL-08):**
  - Runs in the same transaction (`IInteractionWriteTransaction`).
  - **A note does not move the deal.** It is not contact with the client.
  - Only creating an activity moves a deal; editing one never does.
- **Editing (FR-ACT-06):**
  - `PATCH /clients/:clientId/interactions/:id`. The author may edit for 24 hours from `createdAt`; after that, only `activities.add` at Team or All, on a company in that scope.
  - A note stays a note. Editing is not audited (FR-AUD-09 names only the activity results).
- **Reading (FR-ACT-05):**
  - The timeline places an activity at its `occurredAt` and carries author, contact, both result labels, feedback, next action, deal, `recordedAt` and `updatedAt`.
  - `GET /deals/:id/activities` is in the deal's scope and filters notes and other types by `notes.view` and `activities.view`.
  - The dashboard feed still orders by `createdAt`.
- **Outcome categories:**
  - The POST route, its use case and the Settings → Client management tab are removed. The GET stays, read-only, for one milestone.
  - The company page no longer loads outcome categories, so users without `settings.manage` no longer get an empty picker.
- **Frontend:**
  - `components/activities/ActivityDialog` is used on the company page and the deal page. `?logInteraction=` accepts every type.
  - The deal page's activities section is `DealActivitiesSection`.
  - Strings are in sq and en; the removed keys are removed from el and it too.
- **Seeds:** `seed:uat`'s call names the primary contact and the first result.
- **CI:** the backend Jest steps run with 4 GB of heap (TD-034). Merged down to Slices 4–6.
- **Checked locally:**
  - Backend: 272 suites, 4,249 tests. Frontend: 108 files, 1,082 tests. Traceability: 116 of 116.
  - The 360 px suite passed in full (37 tests) against `seed:wellness` + `seed:uat`.
  - UAT-1 step 3 was walked through the API: the call was saved, the deal moved to Contacted with an automatic history row, and the call appeared on the deal and the timeline.

---

### Slice 8 — Pricing screen & draft offer

**Goal:** From a company or a deal, the salesperson opens the pricing screen, sees inputs pre-filled from the company record, and gets the server-calculated breakdown and monthly price as they change inputs. They can apply a discount up to the cap, choose a package, and save, which creates or updates the deal's draft offer with a full snapshot.

**Requirements:** FR-PRC-01, 02, 03, 04, 05, 06, 11, 12 · FR-PRC-07, FR-PRC-10 (use case and screen) · FR-OFR-01, 03, 04 · FR-DSC-01, 02, 04 · FR-PCF-10 (snapshot test) · FR-DEAL-08 (first offer → Offer Prepared) · FR-DEAL-03 (offers section) · NFR-ACC-02 (offer columns) · NFR-SEC-04 (cap on the server) · NFR-PERF-02 (calculation) · FR-RBAC-17 (offers) · Q11

**Depends on:** 1, 3, 4, 6

**Data** (`Quotation` extended; the existing columns and statuses are unchanged)
- `Quotation` gains:
  - `dealId?`, `language 'sq'|'en'`, `pricingInputs Json?`, `ruleSnapshot Json?`, `packageId?`, `note Text?`, and `employeesPriced Int?`.
  - Amount columns: `baseFee, riskFee, visitFee, locationFee, listPrice, discountPercent (7,2), discountAmount, netMonthlyPrice, annualValue`, all `Decimal(12,2)`.
- Slice 9 adds numbering, version and validity.
- The package's services are written as `QuotationLineItem` rows with `unitPrice 0` and no product. The line-item price is unused for offers, and the totals come from the Decimal columns (D4).

**Backend**
- `CalculatePriceUseCase` (`offers.edit`, scoped to the company):
  - It loads the company (employees, business type → risk level via the M1 derivation, city → zones) and the configuration (`LoadPricingConfigUseCase`), then calls `PriceCalculator`.
  - It returns the breakdown, the zones linked to the city (a choice is needed when there are two or more; FR-PRC-06), the active frequencies in their configured order (FR-PRC-05), the active packages, the cap, price per employee and annual value (FR-PRC-10).
  - If the company has no city or business type, it returns `COMPANY_INCOMPLETE` with the missing fields (FR-PRC-02). It never accepts a free-text location or a risk level (FR-PRC-03).
  - It stores nothing (FR-PRC-12).
  - Target: under 300 ms (NFR-PERF-02).
- `SaveDraftOfferUseCase(dealId, inputs, discountPercent, packageId, note, alsoUpdateCompany)`, in one transaction:
  1. Recalculate on the server. The client never sends amounts.
  2. Check the discount cap on the server (FR-DSC-04). Above the cap without an approval, it returns a validation error. Slice 10 turns this into "request approval".
  3. Create the deal's draft offer (the first one) or update the current draft.
  4. Write the amounts, `pricingInputs` and `ruleSnapshot` (D2), and the package service lines.
  5. With `alsoUpdateCompany`, update `Client.employeeCount` through the M1 company use case, which is audited. Otherwise the company is unchanged (FR-PRC-04).
  6. Call `deal.advanceAutomatically(OFFER_PREPARED)` for the first offer (FR-DEAL-08).
  - The offer requires a deal (FR-OFR-01). The old quotation create path is refused under `SALES_PROCESS`.
- `FR-PRC-07` in the use case: "Price on request" returns no amounts, and the save stores the draft without a price. Manual price comes in Slice 10.
- Quotation read models add the new fields. `QuotationsController.ts` already runs `redactFields`, and the new names come from Slice 2's list. Offers are listed under the deal (`GET /deals/:id/offers`).
- The existing `quotations.manage` gate stays for legacy workspaces. Under `SALES_PROCESS`, the offer routes use `offers.edit` and `commercial.view` for reads. The workflow is chosen in `quotationAccess.ts`.

**Frontend**
- `frontend/src/pages/pricing/PricingContent.tsx`, opened from the company page ("Calculate price") and the deal page:
  - Inputs:
    - Employees: whole number ≥ 1, with an "also update the company" checkbox.
    - Business type: select; the risk badge updates live.
    - City: read-only, with a link to edit the company.
    - Zone: shown only if the city has more than one.
    - Frequency, package, discount %, note.
  - The breakdown table and totals are rendered only from the server response. Recalculation is debounced (about 250 ms).
  - The discount field shows the cap. Above the cap, Save is disabled with an explanation until Slice 10.
  - "Price on request" and "Complete the company" states.
  - The sales script button (FR-SCR-01).
- The deal page offers section lists the deal's offers.
- The frontend has no price formula. A lint rule or code review checks that `frontend/src/pages/pricing` imports no arithmetic helpers.

**Tests**
- Integration:
  - `FR-PRC-01`: `POST /pricing/calculate` returns the Example A breakdown.
  - `FR-PRC-02`: a Kamëz company returns location "Kamëz" and zone "Kamëz, Vorë (+30%)"; a company without a city returns `COMPANY_INCOMPLETE`.
  - `FR-PRC-03`: a High-risk business type adds 20%, and a `riskLevelId` sent in the body is ignored.
  - `FR-PRC-04`: pricing 12 employees for a company of 10 leaves it at 10, unless the flag is set.
  - `FR-PRC-05`: only active frequencies are returned, in order.
  - `FR-PRC-06`: Tiranë needs a zone choice; Durrës is set automatically.
  - `FR-PRC-07`: 40 employees gives "Price on request".
  - `FR-PRC-10`: 24.70 per employee and 592.80 per year.
  - `FR-PRC-11`: the chosen package's services are the offer lines.
  - `FR-PRC-12`: calculate-only creates no offer.
  - `FR-OFR-01`: an offer without a deal is refused.
  - `FR-OFR-03`: amounts sent in the body are ignored.
  - `FR-OFR-04` and `FR-PCF-10`: after raising the base fee, the saved offer's amounts and snapshot are unchanged.
  - `FR-DSC-01`: Example A at 10% gives 4.94 and 44.46.
  - `FR-DSC-02`: 10% with a 10% cap saves as a normal draft.
  - `FR-DSC-04`: 20% posted directly returns a validation error.
  - `FR-DEAL-08`: the first offer moves the deal to Offer Prepared.
  - `FR-RBAC-17`: Reception gets 403 on the pricing and offer routes.
  - `NFR-ACC-02`: offer amounts round-trip as strings with no float drift.
- Frontend: the screen renders only server numbers (a mocked response with odd values is shown verbatim). The pricing screen is added to the 360 px suite.

**Done when:** UAT-1 step 4 passes: €49.40 with the Example A breakdown, saved as the deal's draft offer.

**As built:**
- **Data:**
  - Migration `20261003100000_m2_draft_offers`; `mysql_migration_m2_draft_offers.sql` is step 24 of `mysql_upgrade_to_current.sql`. Every new `Quotation` column is nullable or defaulted (`language` 'sq'); nothing is backfilled.
  - `pricePerEmployee` is stored too. `frequencyId`, `zoneId` and `packageId` are RESTRICT keys as well as ids in `pricingInputs`, so a frequency, zone or package an offer used is in use: it can be deactivated, not deleted (409 `PRICING_ITEM_IN_USE`, the rule Slice 3 left open).
  - **The package's services are copied into a new `QuotationService` table** (names and descriptions, `serviceId` SET NULL), not written as `QuotationLineItem` rows. A line item's product and warehouse are required, and invoice conversion, the stock check, the legacy PDF and the reports read them.
  - **`Deal` gains `offerNetMonthlyPrice` and `offerAnnualValue`**, written in the transaction that saves the offer, with an index on `(tenantId, stageKey, offerNetMonthlyPrice)`. Board totals are one `groupBy _sum`, and the list filters (`valueMin`, `valueMax`) and sorts (`sort=value`) on the column. Slices 9 and 10 keep them in step when they change an offer.
  - Tenant deletion clears `Deal.wonQuotationId` and deletes quotations before deals: the two tables now reference each other.
  - Checked locally: no drift on Postgres; on MySQL 8.0 the CI steps report nothing missing, no failing activity check and no drift.
- **Calculation (`POST /pricing/calculate`, `offers.edit`):**
  - The body names a `dealId` or a `clientId`. The scope is checked on the deal's salesperson or the company's; outside it the answer is 404.
  - `PricingScreen` is the one resolve step the calculation and the save share. The result is `PRICED`, `PRICE_ON_REQUEST`, `COMPANY_INCOMPLETE` (city or business type missing) or `INPUT_REQUIRED` (employees, zone or frequency still to choose).
  - A city in no zone is "Price on request" before anything else is chosen. An inactive business type is accepted only if it is the company's own.
  - Annual value is net × contract months; per employee is list ÷ employees (D8).
  - A risk level or amounts in the body are stripped by the schema.
- **Saving (`PUT /deals/:id/offer`, `offers.edit`):**
  - 201 for the deal's first draft, 200 when it is updated. A deal has one draft in this slice.
  - A closed deal gets 409 `OFFER_NOT_EDITABLE`. A missing input gets 400 `INVALID_PRICING_INPUT` with `field`. Above the cap gets 400 `DISCOUNT_ABOVE_CAP`. A discount above 0 needs `discounts.apply` in scope.
  - "Price on request" saves with null amounts; the reason is kept in `ruleSnapshot.priceOnRequest`.
  - `ruleSnapshot` holds `schemaVersion: 1`, the currency, the band, `riskSurchargePercent`, the frequency's type and value, the zone's `surchargePercent`, `discountCapPercent`, the contract months and the validity days. Its key names are the ones `redactFields` already guards.
  - **"Also update the company" is written inside the offer transaction**, with a `Client` audit entry (`employeeCount` old → new), and needs `companies.edit` in scope. `UpdateClientUseCase` opens its own transaction, needs the whole profile and audits only a change of salesperson.
  - The first offer moves the deal to Offer Prepared (automatic history row); a later save or a deal past it does not.
- **Reading:** `GET /deals/:id/offers` needs `commercial.view` and the deal in `deals.view` scope. The deal summary's `netMonthlyPrice` and `annualValue` come from the deal's copy. The value filter and sort need `commercial.view`.
- **Legacy and workflow:**
  - `Tenant` maps `salesWorkflow`. Under `SALES_PROCESS` the legacy create gets 409 `USE_DEAL_OFFERS`. No workspace runs it until Slice 9 sets it for Wellness Albania.
  - Offers stay out of the legacy `/quotations` routes, whose model cannot hold a quotation without product lines.
  - The company history shows an offer through the existing quotation source, with its net monthly price as the total. Slice 9 gives it its reference and permission.
- **Frontend:**
  - `pages/pricing/PricingContent` at `deals/:dealId/pricing` and `clients/:clientId/pricing` (`offers.edit`). It starts from the deal's draft if there is one and recalculates 250 ms after the last change.
  - From a company, the offer is saved on one of its open deals; with none, the screen only calculates.
  - The deal page's offers section is `DealOffersSection`. The company page has a "Calculate price" icon button.
  - `components/pricing/PriceBreakdown` is shared with Settings → Pricing's test calculator.
  - An `.oxlintrc.json` override forbids `decimal.js`, `big.js`, `bignumber.js` and the payment-schedule helper under `pages/pricing` and `components/pricing`.
  - Strings are in a new `pricing` namespace (sq, en). The `offersSoon` placeholder string is removed.
- **Checked locally:**
  - Backend: 275 suites, 4,327 tests. Frontend: 110 files, 1,103 tests. Traceability: 132 of 132.
  - The 360 px suite passed in full (39 tests) against `seed:wellness` + `seed:uat`, both pricing screens included.
  - UAT-1 step 4 was walked through the API as Sales User A, pricing 2 employees, Restaurant, twice a year, Tirana centre on UAT Kafe Blloku's deal. The result was €49.40 with the Example A breakdown, a draft with the package's three services, and the deal moved automatically to Offer Prepared with €49.40 / €592.80.
- **Left as found:** deal pages, now including the pricing screen, highlight Dashboard in the sidebar rather than Pipeline, because the navigation matches `/pipeline` only (Slice 6).

---

### Slice 9 — Offer document: numbering, PDF, preview, versions, mark as sent

**Goal:** Offers get sequential numbers per year (OF-2026-0001). The salesperson previews the Wellness Albania branded offer and downloads it as a PDF in Albanian or English, marks it as sent (which starts the validity), and later marks it accepted or rejected. Changing a sent offer creates a new version. Email sending and the public link are off for Wellness Albania.

**Requirements:** FR-OFR-02, 05, 06, 07, 08, 09, 10, 11, 13, 14, 15 · FR-OFR-12 (mark accepted / rejected; accept → win in Slice 13) · FR-RBAC-18 (workflow switch) · FR-DEAL-08 (marked as sent → Offer Sent) · FR-DEAL-19 (delete check) · FR-AUD-09 (offer status changes) · NFR-I18N-02 (PDF) · NFR-PERF-02 (PDF) · NFR-OPS-02 (references) · Q5, Q9, Q13

**Depends on:** 8

**Data**
- `DocumentSequence (tenantId, kind, year, next)`, primary key `(tenantId, kind, year)` (D5).
- `Quotation` gains `number String?` (unique with `tenantId` and `version`), `version Int @default(1)`, `previousVersionId?`, `validUntil?`, `readyAt?`, and `renderSnapshot Json?` (package services, company details and texts, frozen at READY, D2).
- Status set: add `READY`. The status column is a string, so there is no database enum change.
- Migration: number every existing quotation per tenant and year in `createdAt` order, using the tenant's prefix (default "OF"), and set the counter to the last number used. Set `Tenant.salesWorkflow = 'SALES_PROCESS'` for Wellness Albania (D6), and in `seed-wellness-workspace.ts`.

**Backend**
- `backend/src/quotations/domain/quotationReference.ts` becomes `quotationReference({number, version})` → `OF-2026-0001` or `OF-2026-0001 v2`. Its doc comment already names it as the one place to change (TD-021). All callers switch to it: `SubmitQuotationUseCase`, `ExpireQuotationUseCase`, `MarkQuotationAcceptedUseCase` and `PrismaPublicQuotationReader`. The API returns `reference`, and the frontend stops computing `id.split('-')[0]` in `QuotationListContent.tsx:197` and `QuotationDetailContent.tsx:176,180`.
- `NextDocumentNumber` port (`IDocumentSequence.next(tenantId, kind, year)`). The Prisma adapter runs `SELECT … FOR UPDATE` (Postgres and MySQL) inside the offer-create transaction, so a failed create rolls back the increment. A number handed out is never reused, even if the draft is deleted later (FR-OFR-08). The year comes from `Tenant.timezone`.
- `Quotation` domain under `SALES_PROCESS` (FR-OFR-09):
  - DRAFT → READY when there is a price, no approval is needed (discount ≤ cap) and the deal is open.
  - READY → SENT only through `markSent(sentDate)`, which sets `sentAt` and `validUntil = sentDate + offerValidityDays` (FR-OFR-10, Q9).
  - SENT → ACCEPTED | REJECTED (FR-OFR-12), and SENT → EXPIRED.
  - The legacy transitions stay for `LEGACY_QUOTATIONS`. D6 maps "approved" to READY.
- `ReviseOfferUseCase` (FR-OFR-11): changing a SENT offer copies it to `version + 1` with the same number and `previousVersionId`. The old version becomes read-only (the domain refuses mutations), and only the latest version can be accepted.
- `BuildOfferDocumentUseCase(offerId, lang)` builds the pure `OfferDocument` view model (FR-OFR-02):
  - Number, date and validity; Wellness Albania details; company name, NIPT, address with the sq/en Area and City labels, the chosen or primary contact with position.
  - Employees, business type, risk level, frequency, package and services.
  - Breakdown, list price, discount % and amount, net monthly price, annual value, "VAT not included" (Q5), standard texts, and the salesperson's name, phone and email.
  - No "Wellness price per person" (Q13).
  - It reads `renderSnapshot` for READY and later offers, and live settings for drafts.
- `OfferPdfRenderer` in `backend/src/quotations/infrastructure/` (D3), next to the legacy `QuotationPdfRenderer.ts`, which is unchanged:
  - A registered TTF font committed under `backend/assets/fonts/`, and the Wellness Albania logo from the M1 brand assets.
  - Labels from a server-side sq/en catalogue, and money formatted with the tenant locale.
  - A diagonal "DRAFT" / "DRAFT – PROJEKT" watermark unless the status is READY or later.
  - TipTap JSON is drawn by a walker that handles paragraphs, headings, bullets, bold, italic and links, and ignores unknown nodes (D10).
- Routes:
  - `GET /offers/:id/pdf?lang=sq|en&disposition=inline|attachment`, with file name `Oferta_<company-slug>_<number>.pdf` (FR-OFR-06); the preview uses `inline` (FR-OFR-05).
  - `POST /offers/:id/mark-ready`, `POST /offers/:id/mark-sent {sentDate}`, `POST /offers/:id/revise`, `POST /offers/:id/mark-accepted`, `POST /offers/:id/mark-rejected {note}`.
  - `GET /offers` with filters by status, salesperson, company and date, scoped through the deal owner (FR-OFR-14).
- `FR-OFR-07` / `FR-RBAC-18`: under `SALES_PROCESS`:
  - `publicQuotationRoutes.ts` returns 404 (a tenant check in `GetPublicQuotationUseCase`, plus a guard before the route handlers).
  - `QuotationDeliveryService.deliverToClient` is never called.
  - The legacy `/submit` route is refused.
- Marking as sent calls `deal.advanceAutomatically(OFFER_SENT)` (FR-DEAL-08). `DeleteDeal` now refuses when any offer has `sentAt` (FR-DEAL-19).
- `QuotationExpiryJob.ts` under `SALES_PROCESS` expires offers whose `validUntil` has passed in the tenant time zone, instead of using `sentAt + quotationExpiryDays` (FR-OFR-13). `QuotationFollowUpJob` is skipped for `SALES_PROCESS` tenants, because follow-ups are manual in Slice 11.
- Audit and history (FR-OFR-15): `PrismaQuotationWriteTransaction.ts` gains `auditTrail`. Every status change writes a `QuotationStatusHistory` row and an `Offer` audit entry with number, version, list price, discount and net price, in the same transaction. The `Offer` filter group is registered.
- `QuotationTimelineSource` switches its permission to `commercial.view` and shows `reference`. It stays hidden for Reception (FR-RBAC-17).

**Frontend**
- The offer view on the deal page:
  - Status badge, number and version.
  - "Preview" (an iframe of the inline PDF in a full-width panel; on a phone it opens in a new tab).
  - "Download" with an sq/en choice (default sq).
  - "Mark ready", "Mark as sent" (a date picker defaulting to today), "Revise", "Mark accepted" / "Mark rejected".
  - The version list.
  - There is no "Send by email" button.
- `frontend/src/pages/quotations/QuotationListContent.tsx` becomes the Offers list (filters as FR-OFR-14, `reference` from the API). `QuotationDetailContent.tsx` shows `reference`.

**Tests**
- Domain:
  - `FR-OFR-09`: status transitions, and a draft download carries the watermark flag.
  - `FR-OFR-10`: `markSent` sets `validUntil = sent + validity`.
  - `FR-OFR-11`: version 1 is read-only after revising, and only the latest can be accepted.
- Integration:
  - `FR-OFR-08`: two offers created one after the other get consecutive numbers. A deleted draft's number is not reused. Two parallel creates never get the same number.
  - `FR-OFR-02`: the view model contains every listed field (a snapshot test).
  - `FR-OFR-05` / `FR-OFR-06`: the inline and attachment responses are the same bytes, apart from the header, and have the right file name. `pdf-parse` finds the labels in sq and in en (NFR-I18N-02).
  - `FR-OFR-07`: the public URL returns 404 for Wellness Albania and no email is queued.
  - `FR-OFR-12`: marking rejected with a note.
  - `FR-OFR-13`: an offer sent 31 days ago with 30 days validity is expired by the job.
  - `FR-OFR-14`: a Sales User lists only their deals' offers.
  - `FR-OFR-15`: marking as sent writes a history row and an audit entry.
  - `FR-OFR-04`: an offer downloaded before and after a settings change has the same text content.
  - `FR-PCF-08`: validity 15 → `validUntil` is 15 days after sent.
  - `FR-DEAL-08`: marking as sent moves Interested → Offer Sent and leaves Negotiation unchanged.
  - `FR-DEAL-19`: a deal with a sent offer cannot be deleted.
  - `FR-RBAC-18`: under `SALES_PROCESS`, the legacy submit route is refused.
  - `NFR-OPS-02`: the reference migration numbers every existing quotation once, in order, on Postgres and in the `mysql` job.
  - `NFR-PERF-02`: the PDF is generated in under 3 s in CI; this is a smoke check, and staging is measured in Slice 14.

**Done when:** UAT-1 step 5 passes: preview, then a download with every field, branding and a sequential number, then marked as sent, and the deal moves to Offer Sent. UAT-5 step 3 passes: the UAT-1 offer still shows €49.40 after the Medium surcharge change.

**As built:**
- **Data:**
  - Migration `20261004100000_m2_offer_documents`; `mysql_migration_m2_offer_documents.sql` is step 25 of `mysql_upgrade_to_current.sql`.
  - `Quotation` gains `number`, `version`, `previousVersionId`, `supersededAt`, `readyAt`, `validUntil` (a date), `renderSnapshot` and `contactPersonId` (SET NULL; the chosen contact, FR-OFR-02). The number is unique with `(tenantId, number, version)`.
  - `DocumentSequence (tenantId, kind, year, next)` holds the counter, with kind `OFFER`.
  - The backfill numbers every quotation without a number, per tenant and per **UTC** year of `createdAt` (MySQL's `CONVERT_TZ` needs time-zone tables a host may lack). It uses the tenant's `offerNumberPrefix` (default OF), continues the year's counter and is safe to run twice.
  - The `mysql` CI job plants unnumbered quotations between the two upgrade runs and checks them (`prisma/ci/mysql_check_offer_numbers.sql`).
  - `Tenant.salesWorkflow = SALES_PROCESS` for the `wellness-albania` slug, by migration (a one-off data step) and by `seed:wellness` through `ITenantRepository.setSalesWorkflow`. Behaviour is keyed on the column only.
- **Numbering:**
  - The number is taken when the offer is created. The legacy create takes one too, through `StandaloneOfferNumbers`.
  - The counter row is created with `createMany … skipDuplicates` (ON CONFLICT DO NOTHING / INSERT IGNORE), then incremented. The increment holds the row lock until commit, which is portable and needs no raw `SELECT … FOR UPDATE`.
  - The year comes from the tenant's time zone.
  - `quotationReference({ number, version })` gives `OF-2026-0001` or `OF-2026-0001 v2`. It has nine callers, not the four the plan listed: the six legacy transitions, the public reader, `QuotationFollowUpJob` and the timeline source.
- **Statuses (on `Offer`, not the legacy `Quotation`, which cannot hold an offer):**
  - Draft → Ready needs a price and a discount within the cap the offer was priced with (`ruleSnapshot.discountCapPercent`). Otherwise it is 409 `OFFER_NOT_READY` with `reason` `NO_PRICE` or `DISCOUNT_ABOVE_CAP`; Slice 10 adds approval.
  - Ready freezes `renderSnapshot`: Wellness Albania's details and sq+en texts, the company with its area and city labels, the contact, and the deal's salesperson.
  - Mark as sent takes `sentDate`. It may not be in the future or before the offer was made, in the tenant's zone (400 `INVALID_SENT_DATE`). `sentAt` is noon UTC of that date. `validUntil` is the date plus the offer's own `ruleSnapshot.offerValidityDays`.
  - Sent → Accepted / Rejected takes an optional note, kept on the status-history row and shown as `statusNote`. Sent → Expired is the scheduler's.
  - Revise turns a Sent offer into the next version as a draft (same number, content and services). The old version gets `supersededAt`: read-only, still downloadable, and it cannot be accepted (409 `OFFER_NOT_LATEST`) or expire.
  - The pricing screen saves to the deal's latest Draft or Ready offer; a Ready one goes back to Draft and loses its snapshot. On a Sent one it answers 409 `OFFER_REVISE_FIRST`. After Accepted, Rejected or Expired it starts a new numbered offer.
  - Every view carries `permittedActions`, which mirror the use cases' checks.
- **History and audit:**
  - Every status change writes a `QuotationStatusHistory` row and an `Offer` audit entry (`STATUS_CHANGE`; status, number, version, list price, discount %, net price) in `PrismaOfferWriteTransaction`.
  - A revision writes a `CREATE` entry on the new version.
  - `Offer` has its own `offers` filter group.
- **Document:**
  - `buildOfferDocument` is pure and builds `OfferDocument` from the offer plus its frozen details, or the live ones for a draft.
  - `OfferPdfRenderer` (pdfkit) draws it:
    - Noto Sans Regular, Bold and Italic (OFL, `backend/assets/fonts/` with `OFL.txt`) and `backend/assets/brand/wellness-plus-logo.png`;
    - labels from `offerPdfLabels.ts` (sq/en, same keys, tested);
    - money as `49,40 €` / `€49.40`;
    - a diagonal "DRAFT – PROJEKT" / "DRAFT" on drafts;
    - page numbers;
    - a TipTap walker that skips unknown nodes;
    - `CreationDate` fixed to the offer's date.
  - Inline and attachment responses are the same bytes apart from pdfkit's random font-subset tag (the test normalises it).
  - The file name is `Oferta_<ascii-company-slug>_<number>[-vN].pdf`. CORS exposes `Content-Disposition`.
  - The PDF is about 0.3 s locally.
- **Routes (`/offers`):**
  - `GET /` (the list, FR-OFR-14) and `GET /:id/pdf?lang&disposition` need `commercial.view`, scoped on the deal's salesperson. The CEO and the Administrator can read.
  - `POST /:id/mark-ready|mark-sent|mark-accepted|mark-rejected|revise` need `offers.edit` in scope.
  - Outside the scope the answer is 404.
  - `GET /deals/:id/offers` carries the same view and actions.
- **Workflow switch (SALES_PROCESS):**
  - The public view, PDF and accept/reject routes are 404, through `salesProcess` on the public view. Quotation delivery sends nothing.
  - The legacy `/submit` and `/approve` answer 409 `USE_DEAL_OFFERS`.
  - The follow-up job skips the workspace.
  - The expiry job expires sent offers once `validUntil` is before today in the tenant's zone, whatever `quotationAutoExpireEnabled` says.
  - The legacy sweeps no longer pick up offers (`dealId: null`).
  - The company history's quotation source needs `commercial.view` and shows `reference`.
  - `/auth/me` returns `tenantSalesWorkflow`.
- **Deals:** `DeleteDeal` refuses a deal with any offer that has `sentAt` (409 `DEAL_HAS_SENT_OFFER`). Marking as sent moves the deal to Offer Sent, never backwards.
- **Frontend:**
  - `DealOffersSection` lists every version with its reference, status, validity and status note, and has an `OfferActions` bar:
    - Preview, an inline blob in a full-width modal, or a new tab under 768 px;
    - Download with an sq/en choice;
    - the permitted steps, through `ConfirmDialog` with a date or note input.
  - Revise opens the pricing screen on the new version.
  - `pages/offers/OfferListContent` is at `offers` (`commercial.view`). The sidebar's Offers item shows only under `SALES_PROCESS`, where the legacy Quotations item is hidden.
  - The pricing screen has an "Addressed to" contact select and starts from the latest Draft or Ready offer.
  - Strings are in a new `offers` namespace (sq, en). The legacy quotation pages show `reference`.
- **Checked locally:**
  - Backend: 281 suites, 4,449 tests. Frontend: 111 files, 1,121 tests. Traceability: 146 of 146.
  - MySQL 8.0: baseline, upgrade, fixtures, upgrade again. Nothing was missing, every numbering and activity check was ok, and there was no drift. Postgres: no drift.
  - The 360 px suite passed in full (40 tests) against `seed:wellness` + `seed:uat`, the offers list included.
  - UAT-1 step 5 was walked through the API as Sales User A on UAT Kafe Blloku's deal: Example A as OF-2026-0001 at €49.40, ready, previewed and downloaded in sq and en. Marked as sent today, it is valid until today + 30 and the deal is at Offer Sent.
  - UAT-5 step 3: after the Medium surcharge went to 15%, the PDF's text was unchanged except the validity line, which changed because the offer had been sent in between. The PDF still shows €49.40.
- **Left for later:** accepting an offer does not yet offer to win the deal (Slice 13). The approval path for a discount above the cap and for a manual price is Slice 10.

---

### Slice 10 — Discounts above the cap & approval

**Goal:** A salesperson can give a discount above the cap with a reason. The offer waits for the Sales Manager, who is notified and approves (possibly a lower %) or rejects with a comment. The salesperson is notified. The approval covers exactly that price. For "Price on request", a manual price follows the same approval path.

**Requirements:** FR-DSC-03, 05, 06, 07, 08, 09, 10, 11, 12 · FR-PRC-09 · FR-RBAC-18 (approval switch replaced) · FR-AUD-09 (discount requests and decisions) · NFR-SEC-04 · Q8

**Depends on:** 9

**Data**
- `DiscountApproval`:
  - Fields: `id, tenantId, quotationId, requestedByUserId, kind DISCOUNT|MANUAL_PRICE, requestedPercent Decimal(7,2)?, requestedMonthlyPrice Decimal(12,2)?, listPriceAtRequest Decimal(12,2)?, approvedPercent?, approvedMonthlyPrice?, reason Text, status PENDING|APPROVED|REJECTED|WITHDRAWN|SUPERSEDED, decidedByUserId?, decidedAt?, comment Text?, remindedAt?, createdAt`.
  - Index `(tenantId, status, createdAt)`.
- `Quotation` gains `manualMonthlyPrice Decimal(12,2)?` and `manualPriceReason?`.
- `NotificationSettings` gains `discountApprovalReminderHours Int @default(24)`.

**Backend**
- Domain `DiscountPolicy`:
  - `evaluate(discount, cap, approval?)` → `WITHIN_CAP | NEEDS_APPROVAL | APPROVED_COVERS`.
  - An approval covers the offer only while `listPrice` equals `listPriceAtRequest` and the discount is ≤ `approvedPercent`. Lowering the discount keeps the approval; raising it or changing the list price voids it (FR-DSC-08).
- Use cases:
  - `RequestDiscountApproval`:
    - The reason is required. The offer becomes PENDING_APPROVAL, which blocks final download, mark-sent and win (FR-DSC-03).
    - It supersedes any earlier pending request.
    - It emits `DISCOUNT_APPROVAL_REQUESTED` with `toPermission: {key: 'discounts.approve', subjectOwnerId: deal.ownerUserId}`, minus the requester (D9).
    - The notification carries the company, salesperson, list price, requested % and reason, and links to the request (FR-DSC-05).
    - Email goes through the existing `NotificationEmailDispatcher` when the tenant enables that type.
  - `ListPendingApprovals` requires `discounts.approve` in scope (FR-DSC-06). It replaces `GetPendingApprovalsUseCase` under `SALES_PROCESS`.
  - `DecideDiscountApproval(approve(percent ≤ requested) | reject(comment required))`:
    - The approver cannot be the requester (FR-DSC-09). A Sales Manager's own request therefore goes to the CEO by default (Q8).
    - Approve → the offer takes the approved % and becomes READY.
    - Reject → the offer returns to DRAFT with the discount set to the cap and the comment stored (FR-DSC-07).
    - The salesperson is notified with `DISCOUNT_APPROVED` or `DISCOUNT_REJECTED`.
  - `WithdrawDiscountApproval` → back to DRAFT, and the request leaves the approver's list (FR-DSC-10).
  - `SaveDraftOfferUseCase` (Slice 8) now goes through `DiscountPolicy`. Above the cap, it creates a request instead of refusing. A price-changing edit on an approved offer sends it back to PENDING_APPROVAL (FR-DSC-08). The server check stays (FR-DSC-04, NFR-SEC-04).
  - Manual price (FR-PRC-09): for "Price on request" only.
    - With `discounts.approve`, the user sets it directly with a reason, and it is audited.
    - A Sales User proposes it as a `MANUAL_PRICE` request, and the offer cannot become READY until it is approved.
- `DiscountApprovalReminderJob` (FR-DSC-12): every hour, per tenant, requests PENDING for longer than the configured hours with `remindedAt` null send one `DISCOUNT_APPROVAL_REMINDER` and set `remindedAt`.
- `NotificationService` (`backend/src/notifications/application/NotificationService.ts`):
  - Add `toPermission`, resolved by a new port `IPermissionHolderDirectory` (Prisma: users whose role holds the key, filtered with `recordScopeFor(...).admits(subjectOwnerId)`).
  - Add the three types plus the reminder to `NotificationType.ts`, the `notifications.json` catalogues (sq/en), and `NotificationEmailComposer.ts`. Email text in sq follows the recipient's language, or the tenant default if the user has none.
- `FR-RBAC-18`: under `SALES_PROCESS`, `SettingsService.getRequiresQuotationApproval` is not consulted, `quotations.approve` routes are refused, and `ApproveQuotationUseCase` is not reachable. The Settings → Quotations approval toggle is hidden for this workspace.
- Audit (FR-DSC-11): request, approve, reject and withdraw each write one `DiscountApproval` entry with requested %, approved %, list price and comment. The `DiscountApproval` filter group is registered.

**Frontend**
- Pricing screen:
  - Above the cap, a reason field appears and Save becomes "Request approval".
  - The offer shows "Waiting for Sales Manager approval", with download and mark-sent disabled.
  - The rejection comment is shown after a rejection.
  - Withdraw button.
- "Discount approvals" page (nav item gated by `discounts.approve`):
  - Pending list with company, salesperson, list price, requested % and reason.
  - Approve dialog (an editable % no higher than requested, optional comment) and Reject dialog (comment required).
  - The notification opens the request.
  - The requester sees no Approve button on their own request.
- "Price on request" state: a manual price field with a reason.

**Tests**
- Domain:
  - `FR-DSC-08`: changing the frequency after approval needs a new approval; lowering the discount keeps it.
  - `FR-DSC-09`: self-approval is refused.
- Integration:
  - `FR-DSC-03`: 15% with a 10% cap → PENDING_APPROVAL, and download-final and mark-sent return 409.
  - `FR-DSC-05`: the Sales Manager, and not the requester, gets the notification with all fields. A Sales Manager's own request goes to the CEO.
  - `FR-DSC-06`: approving 12% instead of 15% sets 12% and notifies the salesperson.
  - `FR-DSC-07`: rejection sets the discount to the cap and stores the comment.
  - `FR-DSC-10`: withdrawal.
  - `FR-DSC-11`: four decisions produce four audit entries.
  - `FR-DSC-12`: after 24 hours, exactly one reminder.
  - `FR-PRC-09`: a Sales User's manual price cannot be marked ready until approved.
  - `FR-RBAC-18`: an offer at or under the cap never enters PENDING_APPROVAL, whatever `requiresQuotationApproval` says.
  - `NFR-SEC-04`: direct API calls for each rule (above the cap without approval, self-approval, approving out of scope) get the correct refusal.

**Done when:** UAT-3 passes end to end.

---

### Slice 11 — Follow-ups

**Goal:** With one click, from the company, the deal or right after saving an activity, the salesperson schedules a follow-up (+3, +5 or +7 days, or a custom date). It appears in "My follow-ups" (grouped Overdue, Today, Upcoming), with an overdue count in the menu. It turns red when overdue. It is completed by recording the activity that happened, or it is rescheduled or cancelled. The Sales Manager sees the team's follow-ups.

**Requirements:** FR-FUP-01, 02, 03, 05, 06, 07, 08, 09, 10 · FR-FUP-04 ("My follow-ups"; the calendar part in Slice 12) · FR-ACT-04 · FR-DEAL-08 (follow-up while in Offer Sent → Follow-Up) · FR-DEAL-12 · FR-DEAL-03 (follow-ups section) · Q12

**Depends on:** 7

**Data** (D1)
- `Appointment` gains:
  - `kind String @default("PLANNED")` and `type String @default("MEETING")`.
  - `dealId?, contactPersonId?, endAt?, place?`.
  - `intervalDays Int?`, `completedInteractionId?`, `cancelReason?`, `dueNotifiedAt?`.
- Indexes: `(tenantId, assignedUserId, status, scheduledAt)` and `(tenantId, dealId, status)`.
- Existing rows become `kind PLANNED, type MEETING` through the column defaults, so no data is moved.
- `NotificationSettings` gains `followUpDueNotificationsEnabled` (default true) and `followUpDailySummaryEnabled` (default false).
- `PrismaLookupInUsePolicy.ts`: `FollowUpInterval` in-use counts follow-ups by `intervalDays`, and deactivation is still allowed.

**Backend**
- Domain `FollowUpSchedule.due(now, intervalDays, tz, defaultTime '09:00')`:
  - Calendar days in the tenant time zone. Saturday or Sunday moves to the next Monday (FR-FUP-03, Q12).
  - Example: Monday 5 October + 3 days → Thursday 8 October 09:00 (FR-FUP-01).
  - The backend time-zone helper mirrors `frontend/src/utils/tenantDay.ts` (Intl-based; no new date library).
- `ScheduledActivity` rules in the appointments domain:
  - `isOverdue(now)` = open and `scheduledAt < now` (FR-FUP-05).
  - `complete(interactionId)`, `reschedule(newAt)` (the previous date is written to `AppointmentAuditLog`), `cancel(reason)` (FR-FUP-06).
- Use cases:
  - `ScheduleFollowUp` (`followups.manage`, scoped):
    - Defaults: type Call; assignee = the deal's owner, else the company's salesperson; note = the activity's next action (FR-FUP-02).
    - If the deal is in OFFER_SENT, it calls `advanceAutomatically(FOLLOW_UP)` (FR-DEAL-08).
  - `CompleteFollowUp` records the activity through `AddInteractionUseCase` in the same transaction and links it (FR-FUP-06).
  - `RescheduleFollowUp`, `CancelFollowUp`.
  - `ReassignFollowUp` (TEAM scope or wider, FR-FUP-10).
  - `ListMyFollowUps` (grouped Overdue, Today, Upcoming in the tenant time zone; FR-FUP-07).
  - `ListTeamFollowUps` (a salesperson filter plus an overdue-only list; the CEO reads through `calendar.view: ALL` and has no write permission; FR-FUP-08).
  - `CountMyOverdue` for the menu badge.
- Routes are under `/follow-ups`, with reads gated by `calendar.view` and writes by `followups.manage`. `appointmentAccess.ts` picks `followups.manage` instead of `activities.add` for `kind = FOLLOW_UP`.
- `FollowUpDueJob` (FR-FUP-09): every 5 minutes, per tenant, open follow-ups with `scheduledAt ≤ now` and `dueNotifiedAt` null emit `FOLLOW_UP_DUE` to the assignee and set `dueNotifiedAt`, following `AppointmentReminderJob.ts`. The optional daily summary email is sent at 07:30 in the tenant time zone, listing the day's follow-ups, when enabled. New notification types and sq/en text.
- Deals: the board card and list get `nextFollowUpAt` and `hasOverdueFollowUp`. "No activity for N days" (default 14, a new `PricingSettings`-style workspace sales setting `staleDealDays`) is computed in the query (FR-DEAL-12).
- The appointment timeline source shows follow-ups as `FOLLOW_UP_SCHEDULED` / `COMPLETED` / `CANCELLED` events.

**Frontend**
- `FollowUpQuickButtons`: one button per active follow-up interval (from the M1 lookup store), plus "Custom date". It is used on the company page, on the deal page and in the activity dialog after saving (FR-ACT-04, FR-FUP-01).
- `frontend/src/pages/followUps/MyFollowUpsContent.tsx`: groups, with overdue items in red. Actions: Complete (opens the activity dialog pre-filled with company, deal and type), Reschedule, Cancel.
- Team view with a salesperson filter, read-only for the CEO.
- `NavItem` in `Sidebar.tsx` / `useNavigation.ts` gains an optional `badge` field. The follow-ups item shows the overdue count, refreshed on the same 60 s poll as `useNotifications.ts` (FR-FUP-07).
- Deal board and list: an overdue marker and a stale marker (FR-DEAL-12).

**Tests**
- Domain:
  - `FR-FUP-01`: Monday 5 Oct + 3 → Thursday 8 Oct 09:00, Europe/Tirane.
  - `FR-FUP-03`: +3 on a Thursday → Monday.
  - `FR-FUP-05`: overdue is derived.
- Integration:
  - `FR-FUP-02`: the note defaults to the next action.
  - `FR-ACT-04`: saving a call and clicking +5 creates both.
  - `FR-FUP-04`: the follow-up is in "My follow-ups" right after creation.
  - `FR-FUP-06`: completing creates a linked activity; rescheduling keeps the old date in history.
  - `FR-FUP-07`: the badge count is 2 with two overdue.
  - `FR-FUP-08`: the Manager sees each salesperson's overdue follow-ups, and the CEO gets 403 on writes.
  - `FR-FUP-09`: a follow-up due at 09:00 produces exactly one notification.
  - `FR-FUP-10`: reassigning moves it to the other salesperson's list.
  - `FR-DEAL-08`: a follow-up on an Offer Sent deal moves it to Follow-Up.
  - `FR-DEAL-12`: a follow-up due yesterday shows the overdue marker.
- My follow-ups is added to the 360 px suite.

**Done when:** UAT-1 step 6 passes up to the calendar: "+3 days" creates a follow-up shown in My follow-ups, and the deal moves to Follow-Up.

---

### Slice 12 — Sales calendar

**Goal:** The salesperson's calendar shows follow-ups, planned calls, meetings, visits and online meetings in day, week, month and agenda views, with overdue items listed on today's date. The Sales Manager filters the team by salesperson, with a colour per salesperson. The CEO sees everything, read-only. Items open in a panel with their actions.

**Requirements:** FR-CAL-01, 02, 03, 04, 05, 06, 07, 08 · FR-FUP-04 (calendar part) · NFR-PERF-03 (calendar part) · UAT-4

**Depends on:** 11

**Backend**
- `SearchAppointmentsUseCase` becomes the calendar feed:
  - `GET /calendar?from&to&userIds[]&kinds[]&types[]` requires `calendar.view`, scoped on `assignedUserId`.
  - It returns items in range plus an `overdue` list: open follow-ups and planned items before `from`, up to `now` (FR-CAL-04).
  - One indexed query per list; no N+1 on company, deal or contact names (a single join or one batched lookup).
- `PlanActivity` (`activities.add`, scoped) creates or updates PLANNED items with type, company, deal, contact, start, end, place (visits) and note (FR-CAL-02). `CreateAppointmentUseCase` and `UpdateAppointmentUseCase` gain these fields, and `RescheduleAppointmentUseCase` accepts a new start and end (FR-CAL-07).
- The CEO holds `calendar.view: ALL` without `activities.add` or `followups.manage`, so writes are 403 (FR-CAL-06). The Administrator's and Reception's access stays as the M1 matrix grants it.
- Time zone: items are stored in UTC and the API returns ISO strings. Day boundaries for the range and for "overdue today" are computed in `Tenant.timezone` (FR-CAL-08).
- `AppointmentReminderJob` applies to PLANNED items only; follow-ups use the Slice 11 due notification.

**Frontend** (`frontend/src/pages/appointments/CalendarContent.tsx`)
- Fix the fetch window: the range follows the visible view and refetches on navigation. Today it is fixed to the mount month (line 352), and the desktop navigation state (line 49) never refetches.
- Views:
  - Day, week and month (the existing custom views), plus an Agenda list. `CalendarMobileAgenda` becomes the Agenda view, used on all widths.
  - An "Overdue" section at the top of the day and agenda views for today (FR-CAL-04).
  - Type colours and icons (FR-CAL-01).
- Team filter (visible with `calendar.view` TEAM or ALL): a multi-select of salespeople from `useTeam()` and `getStaffDisplayName`, with a colour per salesperson (FR-CAL-05). The CEO sees no create button and no actions (FR-CAL-06).
- `AppointmentDetailPanel` (`frontend/src/components/panels/`) becomes the item panel:
  - Details plus Complete (a follow-up opens the activity dialog), Reschedule, Cancel, Open company and Open deal (FR-CAL-03).
  - Actions are hidden without the write permission.
- Planning dialog from the calendar and from the company and deal pages (FR-CAL-02).
- Drag to reschedule on desktop week and day views, using native drag with 15-minute snapping (FR-CAL-07). There is no drag on touch.
- Day and month names come from `useDateFormat()` in the user's language (FR-CAL-08).

**Tests**
- Integration:
  - `FR-CAL-01`: a follow-up, a meeting and a visit on the same day are returned with their types.
  - `FR-CAL-02`: a visit Friday 10:00–11:00 is returned in that slot.
  - `FR-CAL-04`: a follow-up due last week is in today's `overdue` list.
  - `FR-CAL-05`: selecting two salespeople returns only their items.
  - `FR-CAL-06`: the CEO sees all items and gets 403 on create and update.
  - `FR-CAL-07`: rescheduling from 10:00 to 14:00.
  - `FR-CAL-08`: an item created at 09:00 Europe/Tirane is returned at 09:00 local for every user.
  - `FR-FUP-04`: a new follow-up is in the calendar feed immediately.
- Frontend: `FR-CAL-03`: completing a follow-up from the panel without leaving the page. The navigation refetch test covers the fixed bug.
- The calendar is added to the 360 px suite (day and agenda views).
- Performance: a seeded 5,000 follow-ups scenario is added to `measure-performance.ts`.

**Done when:** UAT-4 passes.

---

### Slice 13 — Won & lost

**Goal:** A deal is won from its ready, sent or accepted offer, which records the closing date, agreed price, annual value, package, services and salesperson, turns the company into a Client and closes its follow-ups. A deal is lost with a predefined reason. The Sales Manager can reopen either. All of it is audited and shown in the company history.

**Requirements:** FR-DEAL-14, 15, 16, 17, 18 · FR-OFR-12 (accepting offers to win) · FR-AUD-09 (won, lost, reopen, agreed values) · FR-DEAL-20 (won and lost events)

**Depends on:** 10, 11

**Backend**
- Domain `Deal`:
  - `win(offer, closingDate, byUser)` requires an offer of this deal that is the latest version, in READY, SENT or ACCEPTED, with no PENDING approval.
    - It copies `netMonthlyPrice → agreedMonthlyPrice`, `annualValue → agreedAnnualValue`, `packageId`, `wonQuotationId` and the owner, and sets `wonAt`, `closedAt` and stage WON (FR-DEAL-14).
    - The agreed price cannot be passed in, only read from the offer.
  - `lose(reasonId, note?, closingDate)` requires an active `LostReason` (FR-DEAL-16).
  - `reopen(toStage, comment)` requires `deals.reopen` and an open target stage. It keeps the result fields in the history note and clears the stage (FR-DEAL-17).
- `WinDealUseCase`, in one transaction:
  1. The offer → ACCEPTED, with history and audit.
  2. The deal → WON, with stage history.
  3. The company's client status → CLIENT (the M1 locked `STATUS` field, M1 Q9).
  4. The deal's open follow-ups → CANCELLED with reason "deal won", when the user confirmed (FR-DEAL-15).
  5. Audit entries for the deal and the company.
- `LoseDealUseCase`: the deal's open offers (DRAFT, READY, SENT) → REJECTED; open follow-ups closed; audit (FR-DEAL-16, 18).
- `ReopenDealUseCase`: audited, with the previous result kept in `DealStageHistory.note`.
- Changing a won deal's agreed values is only possible through a new offer version and win. Every change is audited (FR-DEAL-18).
- Marking an offer ACCEPTED (Slice 9) returns `canWinDeal: true`, so the UI can offer to win (FR-OFR-12).
- Timeline: `DEAL_WON` (agreed values redacted without `commercial.view`) and `DEAL_LOST` (with reason and note) events.

**Frontend**
- Win dialog: the values from the offer, read-only, plus the closing date (default today) and a "close N open follow-ups" confirmation. Dragging a card to Won opens it (FR-DEAL-07).
- Lost dialog: a required reason select from the active lost reasons, and a note.
- Reopen action for `deals.reopen`, with a stage select and comment.
- The deal page shows the won or lost summary.

**Tests**
- Domain:
  - `FR-DEAL-14`: no win without a qualifying offer; a pending approval blocks it; the price cannot be typed.
  - `FR-DEAL-16`: lost without a reason is refused.
- Integration:
  - `FR-DEAL-15`: after winning, the company status is Client, the offer is Accepted, and there are no open follow-ups for the deal.
  - `FR-DEAL-16`: open offers become Rejected, and the reason appears on the deal and in the company timeline.
  - `FR-DEAL-17`: reopening a Lost deal to Negotiation records who reopened it.
  - `FR-DEAL-18`: win, lose and reopen each create an audit entry.
  - `FR-OFR-12`: accepting returns `canWinDeal`.
  - `FR-DEAL-20`: the timeline shows "Deal won".
- An end-to-end API scenario test runs UAT-1 and UAT-2 against a seeded tenant. It is named `UAT-1` and `UAT-2`, for the hardening report.

**Done when:** UAT-1 and UAT-2 pass on a local seeded workspace.

---

### Slice 14 — Milestone hardening & UAT readiness

**Goal:** Staging is ready for Wellness Albania to run UAT-1 to UAT-6 with one user per role and the seeded pricing values from SRS §4.1.

**Requirements:** NFR-SEC-04, NFR-SEC-05 (review) · NFR-PERF-02, NFR-PERF-03 · NFR-USE-02 · NFR-I18N-02 · NFR-MNT-02 (verified) · NFR-OPS-02 (rehearsal) · FR-RBAC-17 (UAT-6) · FR-AUD-10 (verified) · all UATs

**Depends on:** all

**Work**
- The generated permission matrix and route coverage tests pass with every M2 route. Reviewed exemptions are documented.
- Run `/security-review` on the milestone diff. Write `deploy/security-review-m2.md` in the M1 format:
  - Findings, fixes and accepted risks.
  - Check the D6 switch (public link 404, no email).
  - Check the redaction list against every new response.
  - Revisit the M1 accepted risk "field redaction checks whether `commercial.view` is held, not its scope". It matters more now that deal values exist, so decide whether to fix or accept it again.
- Extend `backend/scripts/uat/seedUat.ts` (tested by `seedUat.test.ts`):
  - The UAT company for UAT-1 (2 employees, a Medium business type, Tiranë).
  - A second deal for UAT-2.
  - Follow-ups and meetings for Sales User A and B, one due yesterday (UAT-4).
  - The seeded pricing configuration and a published placeholder script.
  - `--deals 2000 --follow-ups 5000` for the performance check.
- Measure on staging with `measure-performance.ts`:
  - Price calculation p95 < 300 ms and offer PDF < 3 s (NFR-PERF-02).
  - Board and calendar < 2 s with 2,000 open deals and 5,000 follow-ups (NFR-PERF-03).
- Device pass on Chrome desktop, Safari on iPhone and Chrome on Android for every M2 screen at 360 px, and the `e2e-mobile` job green with the screens added in Slices 5–12 (NFR-USE-02).
- `npm run check:translations`; the offer PDF produced in sq and en; the seeded lists translated (NFR-I18N-02).
- `node scripts/check-traceability.mjs --list`: every M2 Must ID is named in a test, and the remaining Should and Could warnings are reviewed (NFR-MNT-02).
- Migration rehearsal on a production copy (NFR-OPS-02): backup, `mysql_upgrade_to_current.sql` twice, the interaction and reference migrations, `prisma migrate diff` shows no difference, and counts reconcile.
- Write `deploy/uat-milestone-2.md` in the format of `deploy/uat-milestone-1.md`: preparation, pre-flight checklist, UAT-1..6 with the seeded user per step, and a sign-off table.
- Replace placeholder seeds with Wellness Albania's real inputs if they have arrived: script text, cities per zone, services and packages, offer texts, cap, activity results (SRS §11.3).

**Done when:** UAT-1 to UAT-6 pass on staging, run by the team, and the milestone is handed to Wellness Albania for sign-off.

---

## 5. Inputs needed from Wellness Albania, by slice

| Input (SRS §11.3) | Needed by | If late |
|---|---|---|
| Confirmation of "price per employee" (D8) | Slice 1 / 8 | FR-PRC-10 formula (list ÷ employees) |
| Final pricing numbers and bands above 10 employees (Q1) | Slice 3 | Seed from Figure 1; "Price on request" above 10 |
| Meaning of "athoq" and whether €15 is monthly (Q2) | Slice 1, 3 | Ad hoc, fixed €15.00 per month |
| Which cities belong to which price zone; Tirana centre and suburbs (Q3) | Slice 3 | Seed zones from Figure 1; Tiranë in both zones, the salesperson chooses |
| Risk level mapping (Q4) | Slice 3 | 1 = Low 0%, 2 = Medium 10%, 3 = High 20% |
| Maximum discount % (Q7) | Slice 3 | 10% placeholder |
| Services and packages (Q11) | Slice 4 | Placeholder "Standard" package |
| Offer template design, texts, company and bank details (Q5, Q6, Q9, Q13) | Slice 4, 9 | Interim branded layout on pdfkit; VAT excluded; 12 months; 30 days |
| Sales script text in sq and en | Slice 5 | Placeholder with the SRS section headings |
| Who approves a Sales Manager's discount (Q8) | Slice 2, 10 | CEO holds `discounts.approve` |
| Stage movement rules (Q10) | Slice 6 | Free movement between open stages |
| Activity results list (Q14) | Slice 7 | FR-ACT-03 examples |
| Calendar or working days for follow-ups (Q12) | Slice 11 | Calendar days, weekend → Monday |
| Contact position as a list (M1 Q2) | — | No change needed: the offer uses the stored position |

---

## 6. Traceability: requirement → slice

Together, the slices cover every requirement and UAT scenario in the Milestone 2 SRS. Where a requirement is split, the first slice listed adds its ID to `scripts/srs-requirements.json` (rule 1).

| Requirement | Slice(s) |
|---|---|
| FR-SCR-01 | 5 (header, company page); button added to the deal page in 6 and the pricing screen in 8 |
| FR-SCR-02, 03, 04, 05, 06, 07, 08 | 5 |
| FR-PRC-01, 02, 03, 04, 05, 06, 11, 12 | 8 |
| FR-PRC-07 | 1 (calculation, "Price on request"), 8 (use case, screen) |
| FR-PRC-08 | 1 |
| FR-PRC-09 | 10 |
| FR-PRC-10 | 1 (calculation), 8 (screen) |
| FR-PCF-01, 02, 03, 04, 05, 07, 09 | 3 |
| FR-PCF-06, 08 | 4 (FR-PCF-08 validity effect tested in 9) |
| FR-PCF-10 | 3 (rule), 8 (snapshot test) |
| FR-DSC-01, 02, 04 | 8 (FR-DSC-04 extended in 10) |
| FR-DSC-03, 05, 06, 07, 08, 09, 10, 11, 12 | 10 |
| FR-OFR-01, 03, 04 | 8 (FR-OFR-04 re-download checked in 9) |
| FR-OFR-02, 05, 06, 07, 08, 09, 10, 11, 13, 14, 15 | 9 |
| FR-OFR-12 | 9 (mark accepted / rejected), 13 (accept → win) |
| FR-DEAL-01, 02, 04, 05, 06, 07, 09, 10, 11, 13, 20 | 6 (FR-DEAL-20 won / lost events in 13) |
| FR-DEAL-03 | 6 (page), sections in 7, 8, 9, 11 |
| FR-DEAL-08 | 6 (rule), 7 (first activity), 8 (first offer), 9 (sent), 11 (follow-up) |
| FR-DEAL-12 | 11 |
| FR-DEAL-14, 15, 16, 17, 18 | 13 |
| FR-DEAL-19 | 6 (soft delete), 9 (sent-offer check) |
| FR-ACT-01, 02, 03, 05, 06, 07 | 7 |
| FR-ACT-04 | 11 |
| FR-FUP-01, 02, 03, 05, 06, 07, 08, 09, 10 | 11 |
| FR-FUP-04 | 11 (My follow-ups), 12 (calendar) |
| FR-CAL-01, 02, 03, 04, 05, 06, 07, 08 | 12 |
| FR-RBAC-15, 16 | 2 |
| FR-RBAC-17 | 2 (mechanism), 6 (deals), 8 (offers, pricing), 9 (timeline), 14 (UAT-6) |
| FR-RBAC-18 | 9 (workflow switch, email and public link off), 10 (approval switch replaced) |
| FR-AUD-09 | 3 (pricing, cap), 4 (services, packages, offer settings), 5 (script), 6 (salesperson, delete), 7 (activity results), 9 (offer status), 10 (discounts), 13 (won, lost, reopen, agreed values) |
| FR-AUD-10 | 2 (registry), every slice registers its type, verified in 14 |
| NFR-ACC-01 | 1 |
| NFR-ACC-02 | 1 (Money), 3 (schema test), 8 (offer columns) |
| NFR-SEC-04 | 2, 8, 10 (every slice via rule 4); verified in 14 |
| NFR-SEC-05 | 4 (offer texts), 5 (script); reviewed in 14 |
| NFR-PERF-02 | 8 (calculation), 9 (PDF); measured in 14 |
| NFR-PERF-03 | 6 (board), 12 (calendar); measured in 14 |
| NFR-USE-02 | every slice (rule 8); verified in 14 |
| NFR-I18N-02 | every slice (rule 8), 9 (PDF); verified in 14 |
| NFR-MNT-02 | every slice (rule 1); verified in 14 |
| NFR-OPS-02 | 7 (interactions), 9 (references); rehearsed in 14 |
| UAT-1 Complete sale, won | 5, 7, 8, 9, 11, 12, 13 |
| UAT-2 Deal lost | 6, 13 |
| UAT-3 Discount above the cap | 10 |
| UAT-4 Calendars | 11, 12 |
| UAT-5 Script and pricing administration | 3, 5, 9 |
| UAT-6 Reception sees no sales data | 2, 6, 8, 9, 14 |
