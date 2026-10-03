# Wellness Albania Platform — Milestone 1 Implementation Plan (slice-based)

| Item | Value |
|---|---|
| Source | `Wellness Platform - Milestone 1 SRS.docx` v0.1 (27.09.2026), `Wellness Platform - Milestones.docx` |
| Scope | Milestone 1: Platform Foundation |
| Approach | Vertical slices. Each slice is one branch, one PR, with its own schema change, backend, frontend, translations and tests. At the end of each slice, something works that Wellness Albania can see or that a test proves. |
| Date | 27.09.2026 |

---

## 1. How to read this plan

Milestone 1 is split into **15 slices**. Taken together they cover every Must, Should and Could requirement in the SRS (section 6 maps each requirement to its slice). Each slice lists:

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
| 1 | Brand & language shell | M | — | UAT-4 (branding) |
| 2 | Audit trail foundation | M | — | — |
| 3 | Permission engine & the five roles | L | — | UAT-1 (menus) |
| 4 | Data scope & field redaction | L | 3 | **UAT-1** |
| 5 | User administration on the new roles | M | 2, 3 | **UAT-5** |
| 6 | Roles & permissions admin screen | M | 2, 3 | UAT-3 (step 3) |
| 7 | Audit log viewer | S | 2, 3 | UAT-3 (step 4) |
| 8 | Lookup-list framework + risk levels & business types | M | 2, 3 | UAT-3 (step 1) |
| 9 | Areas & cities | S | 8 | UAT-3 (step 2) |
| 10 | Sales lists, status labels & workspace settings | M | 8 | — |
| 11 | Company record: new fields, risk derivation, location | L | 4, 8, 9 | UAT-2 |
| 12 | Contact persons | M | 11 | **UAT-2** |
| 13 | Unified company history timeline | M | 12 | — |
| 14 | Legacy client data migration | M | 11, 12 | — |
| 15 | Milestone hardening & UAT readiness | M | all | **UAT-1..5 on staging** |

### 1.2 Dependency graph and parallel tracks

```
            ┌─► 4 Data scope ───────────────────────────┐
3 RBAC ─────┼─► 5 Users ◄── 2                            │
  │         ├─► 6 Roles admin ◄── 2                      ▼
  │         ├─► 7 Audit viewer ◄── 2          11 Company fields ─► 12 Contacts ─► 13 Timeline
  │         └─► 8 Lookups ◄── 2 ─► 9 Areas/Cities ─────┘                │
  │                          └──► 10 Sales/status lists                  ▼
  │                                                              14 Migration ─► 15 Hardening
1 Brand & language (independent, any time)
```

With two developers, a workable split is:

- **Track A:** 3 → 4 → 11 → 12 → 13 → 14
- **Track B:** 1 → 2 → 5 → 6 → 7 → 8 → 9 → 10
- **Both:** 15

Slice 11 cannot start until 4, 8 and 9 are merged, so Track B must finish 8 and 9 before Track A reaches 11.

---

## 2. Cross-cutting rules (every slice)

These apply to every slice and are part of its definition of done.

1. **TDD.** Write the failing test first: Jest for domain logic and use cases, Supertest for endpoints, Vitest for frontend components. Put the SRS requirement ID in the test name, e.g. `it('FR-CMP-02 derives risk level from business type', …)` (NFR-MNT-01).
2. **Clean Architecture.** Permission checks, scope resolution, risk derivation and lookup rules belong in domain and application code. Controllers and middleware only parse input, call a use case and map the result.
3. **Two schemas.** Every model change goes into `backend/prisma/schema.prisma` **and** `backend/prisma/schema.mysql.prisma`. It also needs a Postgres migration in `prisma/migrations/` and a matching MySQL script (`prisma/mysql_migration_*.sql`, folded into `mysql_upgrade_to_current.sql`) (NFR-OPS-01).
4. **Tenant isolation.** Every new table has `tenantId`. Every new repository method takes `tenantId` as its first argument, so a query without a tenant cannot be written.
5. **Translations.** Every new string goes into `frontend/src/locales/sq` and `/en` (and `el`/`it` keys, which may fall back to English). `npm run check:translations` must pass (FR-LNG-02, NFR-I18N-01).
6. **Audit.** Every sensitive write calls the audit port from Slice 2 **inside the same transaction** (FR-AUD-04). Once Slice 2 is merged, a slice that adds a sensitive write without an audit call is not done.
7. **Permissions.** Once Slice 3 is merged, every new endpoint declares its required permission and every new menu item declares its permission. Role names are never compared (FR-RBAC-05, FR-RBAC-07).
8. **Mobile.** Every new screen works from 360 px wide (NFR-USE-01).
9. **Out of scope.** Do not build Milestone 2–4 behaviour. Where the SRS asks for groundwork (permission keys for M2/M3, lost-deal reasons, follow-up intervals), build the configuration only, not the feature that uses it.

---

## 3. Decisions this plan takes (confirm or override)

The SRS leaves these open or does not cover them. The plan assumes the answers below so that work can start. Changing an answer only changes the slice named.

| # | Decision | Assumed answer | Affects |
|---|---|---|---|
| D1 | Where permissions are resolved | **Per request, from the database** (small in-process cache, cleared on any role or permission change). Today the JWT carries `role`, so a role change would only apply after re-login. That breaks FR-USR-03 and FR-RBAC-03 ("immediately"). | 3 |
| D2 | Legacy role mapping (SRS Q4) | `BUSINESS_OWNER` → Administrator, `STAFF` → Sales User. `SUPER_ADMIN` stays outside the role table: the platform operator gets every permission with scope All, including while impersonating. | 3 |
| D3 | Reception's "notes only" rights | Split into separate permissions: `activities.*` (calls, emails, visits, meetings) and `notes.*`. Reception gets `notes.view: ALL` and `notes.add: ALL`. "All (basic)" is not a separate scope: it is `companies.view: ALL` without `commercial.view` or `payments.view`, and field redaction does the rest. | 3, 4 |
| D4 | Team scope includes the manager's own records | Yes. Team = companies assigned to any Sales User **or to the viewer**, plus unassigned companies. | 4 |
| D5 | Existing `AuditLog` table | Left in place for platform-operator actions (Super Admin console). A new tenant-scoped `AuditEntry` table becomes the compliance record. `PrismaAuditLogger` is not reused for tenant changes. | 2 |
| D6 | Mapping of old payment status keys | `UNPAID` → `PAYMENT_PENDING`, `PARTIAL` → `PARTIALLY_PAID`, `PAID` → `PAID`. **`WAIVED` has no equivalent in the SRS set.** Proposal: keep `WAIVED` as a hidden legacy key that the Administrator cannot configure and that is not offered for new payments. Needs Wellness Albania's confirmation. | 10 |
| D7 | Client name, email, phone, status and assignee | Stay on the existing FieldRole mechanism (`PRIMARY_NAME`, `PRIMARY_EMAIL`, `PRIMARY_PHONE`, `STATUS`, `ASSIGNEE`), because the SRS only adds the columns listed in §7.1. `ASSIGNEE` becomes a locked system field whose mirror `Client.assignedUserId` is always written, because data scope depends on it. | 4, 11 |
| D8 | Modules the SRS does not mention (inventory, invoices, forms, integrations, reports, appointments) | Keep them, behind a coarse permission each (`inventory.manage`, `invoices.manage`, `forms.manage`, `integrations.manage`, `reports.view`), granted to Administrator only by default. Appointments fall under `calendar.view`/`activities.add`. The Administrator can grant them to other roles without a deployment. | 3 |
| D9 | Open questions Q1, Q2, Q3, Q5–Q9 | The SRS's proposed defaults: Area = region; contact position is free text; one sales team; Administrator sees all data; CEO has view only; NIPT optional and unique; client status is a fixed set. | 4, 9, 11, 12 |

---

## 4. The slices

### Slice 1 — Brand & language shell

**Goal:** A user who opens the app sees Wellness Albania, in Albanian, everywhere. Neva CRM does not appear on any page they can reach.

**Requirements:** FR-BR-01, 02, 03, 04, 05 · FR-LNG-01, FR-LNG-04 (workspace defaults) · NFR-I18N-01 (CI gate)

**Depends on:** —

**Frontend**
- Replace the Neva logo in `components/layout/AuthLayout/AuthLayout.tsx` and `AppLayout/AppLayout.tsx` (and their stories) with the Wellness Plus logo. Use the leaf-and-cross symbol for the favicon and the collapsed sidebar. Ask for an SVG and use the PNG until it arrives.
- Put the palette from SRS §3.1 into `styles/tokens.css`, in light and dark mode: Navy `#0B2B42`, Teal `#04A68C`, Blue-teal `#048E9C`, Green `#3DAA6C`. Check text contrast against WCAG AA.
- Redesign the login, forgot-password and reset-password pages.
- Product name: `index.html` `<title>`, the page-title hook, and the `common.json` / `auth.json` strings in all four locales. Several locale files still say "Neva".
- Hide sign-up, subscription and SaaS landing routes (`pages/landing`, tenant onboarding) behind a build flag, so an anonymous user can only reach login and password recovery (FR-BR-05).
- Make `sq` the i18next fallback and default language. Keep `en`, `el` and `it` in the language menu.

**Backend**
- Brand the email layout (`shared/email/emailLayout.ts`): logo, colours, the name "Wellness Albania", and no Neva footer.
- Seed the Wellness Albania tenant with `defaultLanguage = 'sq'`, `locale = 'sq-AL'`, `timezone = 'Europe/Tirane'`, `dateFormat = 'DD.MM.YYYY'`, and currency from SRS §8 (EUR or ALL).
- Disable the public tenant sign-up endpoint in this edition.

**Tests**
- A frontend test asserts that the login page renders the Wellness logo and no "Neva".
- A CI step greps `frontend/src` and `backend/src/shared/email` for `Neva` and fails if it finds any (FR-BR-04 acceptance).
- `check:translations` runs in CI.
- An integration test asserts that the invitation and reset emails contain "Wellness Albania" and no "Neva".

**Done when:** UAT-4 steps 1–2 pass for branding: login page, header, favicon and emails are branded; the default is Albanian and the user can switch to English.

---

### Slice 2 — Audit trail foundation

**Goal:** Any use case can record a sensitive change as an append-only entry with field-level old and new values, in the same transaction as the change. The first real users are the contract and payment writes that already exist.

**Requirements:** FR-AUD-01, 03, 04, 05, 07 · FR-AUD-02 (contract status, commercial terms, contract payments)

**Depends on:** —

**Data**
- New model `AuditEntry`: `id, tenantId, at, userId, userRole, action (CREATE|UPDATE|DELETE|STATUS_CHANGE), entityType, entityId, entityLabel, changes Json [{field, old, new}]`. Indexes on `[tenantId, at]` and `[tenantId, entityType, entityId]`. No foreign keys, for the same reason as `AuditLog`: the trail has to outlive the rows it describes.

**Backend**
- Domain: an `AuditChange` value object and a pure `diff(before, after, fieldList)` function. The function redacts secret fields (`password`, `hashedPassword`, `token`, and anything the caller marks secret) to the value `"changed"` (FR-AUD-07).
- Application: an `IAuditTrail` port with `record(entry)`. It is transaction-bound: the use case receives it from a unit-of-work port, following the existing pattern in `PrismaOwnershipTransactions` and `PrismaCustomFieldWriteTransaction`. If the audit write fails, the business write rolls back (FR-AUD-04).
- Infrastructure: `PrismaAuditTrail`, which only creates entries. No update or delete method exists anywhere, and no route exposes one (FR-AUD-05).
- Retrofit the contract use cases (activate, cancel, renew, edit terms, expire) and the payment use cases (record, update, revert) in `src/contracts` to write entries (FR-AUD-02, contract part). Scheduler-driven expiry records `userId = null`, labelled "system".
- Adding an audited entity later means one `auditTrail.record(...)` call in its use case (FR-AUD-03). Write this down in a short developer note in the `shared/application` folder README or a code comment on the port.

**Tests**
- Unit tests for `diff`: only changed fields, redaction, nested values.
- A use-case test: when the audit write is forced to throw, the contract status is unchanged (FR-AUD-04).
- An integration test: activating a contract and recording a payment each create one entry with the correct old and new values.

**Done when:** Changing a contract or payment through the existing UI leaves a correct `AuditEntry` row (checked in the database or by a test). The viewer comes in Slice 7.

---

### Slice 3 — Permission engine & the five roles

**Goal:** Users hold one of five roles made of permissions. Every endpoint checks a permission instead of a role name, and the menu is built from the user's permissions. Logging in as each role shows a different menu.

**Requirements:** FR-RBAC-01, 02, 05, 07, 09 · enabler for FR-USR-03 · NFR-SEC-01 (endpoint side)

**Depends on:** —

**Data**
- New models: `Role (id, tenantId, key, nameSq, nameEn, isSystem)` and `RolePermission (roleId, permissionKey, scope OWN|TEAM|ALL|null)`.
- Add `User.roleId` (nullable during migration). Keep `User.role` so that `SUPER_ADMIN` and the rollback path still work.
- Migration: seed the five system roles (`SALES_USER`, `SALES_MANAGER`, `RECEPTION`, `ADMINISTRATOR`, `CEO`) for every tenant with the default matrix from SRS §4.2. Map existing users per D2.

**Backend**
- Domain: a `PermissionCatalogue` defined in code. Each entry has `key`, `group`, `supportsScope` and a milestone tag. Proposed keys:
  `companies.view*`, `companies.edit*`, `companies.delete*`, `companies.reassign*`, `activities.view*`, `activities.add*`, `notes.view*`, `notes.add*`, `calendar.view*`, `contracts.validity.view*`, `commercial.view*` (M2), `payments.view*` (M3), `payments.update`, `performance.view*` (M3), `users.manage`, `roles.manage`, `pricing.manage` (M2), `settings.manage`, `audit.view`, plus the D8 module keys. Keys marked * support a scope.
- Domain: an `AccessContext` value object: `{ userId, roleKey, permissions: Map<key, scope|true> }`, with `can(key)` and `scopeOf(key)`.
- Application: `ResolveAccessContextUseCase(userId)` loads the user, the role and its permissions. It refuses deactivated users (FR-USR-04 enforced per request, not only at login). Results are cached per user, and the cache is cleared by a `PermissionsChanged` signal (D1).
- Interfaces: replace `authorize(roles)` (`main/interfaces/http/middlewares/authorize.ts`, 43 call sites) with `requirePermission(key)`. The middleware attaches `req.access`. Keep the old middleware only for `SUPER_ADMIN`-only platform routes.
- Replace role-name checks inside use cases (about 68 files, mostly `inventory`, `auth`, `quotations`, `clients` and `invoices`). Pass `AccessContext` to the use case instead of `role`. Do this module by module, one commit each.
- `GET /auth/me` returns `permissions: { [key]: scope | true }` and a `permissionsVersion`. Every response carries an `X-Permissions-Version` header.

**Frontend**
- `useAuthStore` keeps `permissions`. Add a `usePermission(key)` hook and a `<Can permission=…>` component.
- `RequirePermission` replaces `RoleGuard` (`routes/RoleGuard.tsx`). The nav configuration in `AppLayout` declares a permission for each item, so a role never sees a link it cannot use (FR-RBAC-07).
- When `X-Permissions-Version` changes, the frontend refetches `/auth/me`, so a role change shows on the next page load without re-login (FR-USR-03).

**Tests**
- A matrix test: for each of the five roles × every protected endpoint, the endpoint returns 200 or 403 as the §4.2 matrix says. Generate the test table from the catalogue so new endpoints cannot be forgotten (NFR-SEC-01).
- Unit tests for `AccessContext`. A test that a deactivated user's valid JWT is refused.
- A frontend test: the nav for each role matches the expected items.

**Done when:** One test user per role logs in. Each sees only the menu items the matrix allows. A direct call to a forbidden endpoint returns 403. Every existing test passes with legacy users mapped to the new roles.

---

### Slice 4 — Data scope & field redaction

**Goal:** Own, Team and All scope decide which records each user can reach. Fields a role may not see are removed from API responses. UAT-1 passes on existing data.

**Requirements:** FR-RBAC-06, 11, 12, 13, 14 · UAT-1

**Depends on:** 3

**Backend**
- Domain: a `DataScope` policy that turns `(AccessContext, permissionKey)` into a repository filter: `OWN` → `assignedUserId = me`; `TEAM` → `assignedUserId ∈ salesUsers ∪ {me}` or unassigned (D4); `ALL` → no filter. Tenant isolation stays underneath, unchanged.
- Apply the scope filter in the repository query, never after loading, so counts and pagination stay correct (FR-RBAC-13):
  - Clients: search, get, related counts, history, export and import (`src/clients`).
  - Interactions (split into activities and notes by `channel`, per D3).
  - Appointments and calendar feeds.
  - Contracts, quotations and invoices (scoped through the company).
  - Dashboard and report aggregates.
- A record outside the user's scope returns **404**, not 403 (FR-RBAC-05).
- `CreateClientUseCase` defaults `assignedUserId` to the creator when the creator is a Sales User (FR-RBAC-14). `ASSIGNEE` becomes a locked system field (D7).
- Field redaction: a response mapper per resource drops `amount`, `paidAmount`, price, line-item totals, payment rows and so on when the user lacks `commercial.view` or `payments.view`. Reception's contract view is reduced to `{status, startsAt, endsAt}` (FR-RBAC-06).

**Frontend**
- Screens stop assuming fields exist. Hide columns and panels when the permission is missing, e.g. the contract panel for Reception shows only validity.
- Scope filters on the client list (my, team, all) appear only when the scope allows them.

**Tests**
- An integration test: Sales User A gets 404 for Sales User B's company, A's list count equals A's companies only, and the Manager sees A's, B's and unassigned companies.
- A snapshot-style test on the Reception API responses for company, contract and timeline: the JSON contains no `amount`, `price` or `payment*` keys.
- A test that dashboard and report numbers change per scope.

**Done when:** UAT-1 runs end to end on the existing data.

---

### Slice 5 — User administration on the new roles

**Goal:** The Administrator invites users with a role, changes roles (the change applies on the user's next page load), and deactivates users, with a forced reassignment of their companies. Every action is audited.

**Requirements:** FR-USR-01, 02, 03, 04, 05, 06 · FR-AUD-02 (users) · UAT-5

**Depends on:** 2, 3

**Backend**
- Adapt the existing use cases to `roleId` instead of the role string: `InviteStaffUseCase`, `AcceptInvitationUseCase`, `CreateUserUseCase`, `UpdateUserRoleUseCase`, `DeactivateUserUseCase`, `ReactivateUserUseCase`, `GetTenantStaffUseCase`. Add `Invitation.roleId`. The invitation email goes out in the tenant's default language (sq).
- A role change raises `PermissionsChanged` so the cache from Slice 3 is cleared.
- Extend `GetDeactivationImpactUseCase` to list the user's assigned companies. Deactivation accepts `reassignToUserId` and reassigns the companies (and their open contracts) in the same transaction. It refuses to finish if assigned companies would be left behind (FR-USR-05).
- Audit: user created or invited, role change (old role → new role), deactivation and reactivation, and each company reassignment (FR-USR-06, FR-AUD-02).
- Login and password reset stay as they are (FR-USR-01). Check that the reset email follows the user's language.

**Frontend**
- The Team page in settings: role picker (roles from the API, with sq/en labels), activate and deactivate, and a reassignment dialog shown when the user being deactivated has companies.

**Tests**
- A use-case test: deactivation without a reassignment target fails when the user has companies.
- An integration test: after a role change, the user's next request with their existing token gets the new permissions.
- Audit entries exist with old and new values.

**Done when:** UAT-5 passes.

---

### Slice 6 — Roles & permissions admin screen

**Goal:** The Administrator edits each role's permissions and scopes from the admin panel, and can create a custom role by copying one. Changes apply immediately and are audited.

**Requirements:** FR-RBAC-03, 04, 08, 10 · UAT-3 step 3

**Depends on:** 2, 3

**Backend**
- Use cases: `ListRoles`, `GetRole`, `UpdateRolePermissions(roleId, [{key, scope}])`, `CopyRole(sourceId, names)`, `RenameRole`, and `DeleteCustomRole`, which is refused while users hold the role.
- Validation: the key must exist in the catalogue, and a scope may only be set on scoped keys. Permissions tagged M2 or M3 can be stored now (the SRS says to define them now).
- Lock-out guard (FR-RBAC-08): reject any change, whether a permission edit, a role change or a deactivation, that would leave the tenant with no active user holding `roles.manage`. This lives in a domain service and is reused by Slice 5.
- Audit one entry per save, with the old and new permission set and the added and removed keys listed (FR-RBAC-10). Raise `PermissionsChanged`.

**Frontend**
- A new Settings → Roles & permissions page: a list of roles, then a permission grid grouped by catalogue group, with a scope select (Own / Team / All) on scoped rows. Milestone tags mark the M2 and M3 rows ("available from Milestone 2"). "Copy role" is in the same place.

**Tests**
- Removing `contracts.validity.view` from Reception makes the next Reception request lose the field (the FR-RBAC-03 acceptance case).
- The last `roles.manage` holder cannot be removed.
- A custom copied role can be assigned to a user and behaves as the source role did.

**Done when:** UAT-3 step 3 passes: the permission is removed from Reception and Reception loses it immediately.

---

### Slice 7 — Audit log viewer

**Goal:** Users with `audit.view` (Administrator and CEO) can search the audit log and open an entry to compare old and new values side by side. They can export what they see.

**Requirements:** FR-AUD-06, FR-AUD-08 · UAT-3 step 4

**Depends on:** 2, 3

**Backend**
- `SearchAuditEntriesUseCase`: filters by date range, user, entity type and action, with pagination, newest first. `GET /audit` and `GET /audit/:id` are the only audit routes.
- `GET /audit/export.csv` applies the same filters and streams the rows (FR-AUD-08).

**Frontend**
- Settings → Audit log: a filter bar, a table (time, user and role, action, entity), and a detail drawer with a field / before / after table. Entity types and field names are translated through an `audit.json` namespace. Redacted values show as "changed".
- The CEO sees it read-only. There are no actions to take on an entry.

**Tests**
- A filtered search returns the expected entries. The CSV matches the on-screen filter. No PUT, PATCH or DELETE route exists for audit entries (a route-table test).

**Done when:** The changes made in Slices 2, 5 and 6 can be found and read in the viewer.

---

### Slice 8 — Lookup-list framework + risk levels & business types

**Goal:** A reusable admin-managed list, with sq/en labels, order, active flag, protection for values in use, and auditing. Its first two users are risk levels and business types, with each business type linked to one risk level.

**Requirements:** FR-SET-01, 02, 10 (partial) · FR-LNG-03 · FR-AUD-02 (settings)

**Depends on:** 2, 3

**Data**
- `RiskLevel (id, tenantId, level, nameSq, nameEn, description, order, active)`.
- `BusinessType (id, tenantId, nameSq, nameEn, riskLevelId, order, active)`.

**Backend**
- Domain: a `LookupItem` base (a label pair where `sq` is required and `en` is optional, plus order and active) and a `LookupInUsePolicy` port. A value that is in use can only be deactivated, never deleted. Deactivated values stay on existing records but are not offered for new ones.
- A generic application layer: `Create`, `Update`, `Reorder`, `Deactivate`, `Reactivate` and `Delete` use cases, parameterised by list type. Every write is audited. All writes need `settings.manage`. Reads are open to any authenticated user in the tenant: active values only, or all values when the user has `settings.manage`.
- Business type validation: `riskLevelId` must point to an active risk level. Deactivating a risk level that active business types still use is refused.
- Seed placeholder values for Wellness Albania (e.g. Call center → Level 1, Café → Level 1, Factory → Level 3) until the real list arrives (SRS §8.3).

**Frontend**
- A shared `LookupListEditor` component (table, inline sq/en label editing, drag to reorder, active toggle) used on Settings → Lists → Risk levels and → Business types. The business type row has a risk-level select.
- A `lookupLabel(item, lang)` helper that falls back to `sq` when `en` is missing (FR-LNG-03).

**Tests**
- Unit tests: an in-use value cannot be deleted; deactivated values are excluded from active reads.
- Integration: a new business type shows up in the active list immediately (FR-SET-01 acceptance). Every write leaves an audit entry.

**Done when:** UAT-3 step 1 passes: the Administrator changes a business type's risk level and the change appears in the audit log. The company form that uses these lists comes in Slice 11.

---

### Slice 9 — Areas & cities

**Goal:** Predefined areas and the cities in each area, managed by the Administrator. This implements Dimitris's comment ("area and cities will be predefined").

**Requirements:** FR-SET-03, 04 · Q1 (assumed Area = region)

**Depends on:** 8

**Data**
- `Area (id, tenantId, nameSq, nameEn, order, active)`.
- `City (id, tenantId, areaId, nameSq, nameEn, order, active)`, unique on `(tenantId, areaId, nameSq)`.

**Backend**
- Reuse the lookup framework. Cities are read with an area filter (`GET /lookups/cities?areaId=`). A city cannot be created under an inactive area. Deactivating an area that has active cities asks whether to deactivate those cities too.
- Seed placeholder data: Albanian qarqe as areas, with a few cities each, until Wellness Albania's list arrives (SRS §8.3).

**Frontend**
- Settings → Lists → Areas and → Cities. The cities editor has an area filter and an area column.

**Tests**
- A city is always tied to one area. The filtered read returns only that area's cities. Every write is audited.

**Done when:** UAT-3 step 2 passes: the Administrator adds a city and it appears in the audit log.

---

### Slice 10 — Sales lists, status labels & workspace settings

**Goal:** The rest of the admin settings: follow-up intervals, lost-deal reasons, configurable labels, order and colour for contract and payment statuses, and general workspace settings.

**Requirements:** FR-SET-05, 06, 07, 08, 09, 10 · FR-LNG-04

**Depends on:** 8

**Data**
- `FollowUpInterval (id, tenantId, days, labelSq, labelEn, order, active)`, seeded with 3, 5 and 7 days.
- `LostReason (id, tenantId, nameSq, nameEn, order, active)`, seeded with the four reasons in FR-SET-06.
- `StatusLabel (tenantId, domain CONTRACT|PAYMENT, key, labelSq, labelEn, colour, order)`. The keys are fixed in code, so there is no create or delete.
- Status key migration (SRS developer note in §5.2):
  - `ContractStatus` gains `PENDING_SIGNATURE` and `SUSPENDED`. The existing keys are unchanged.
  - `PaymentStatus` gains `NOT_INVOICED`, `INVOICE_ISSUED`, `PAYMENT_PENDING`, `PARTIALLY_PAID` and `OVERDUE`. Existing `ContractPayment.status` rows are migrated per **D6**.
  - Update `src/contracts/domain/Contract.ts` and `ContractPayment.ts`, and keep the existing activate, renew and expire behaviour working with the new keys. New transitions are Milestone 3.

**Backend**
- Follow-up intervals: `days` is a whole number ≥ 1 and unique among active rows. Nothing uses the list yet; that comes in M2.
- Status labels: an update-only use case (label, colour, order), audited. A `StatusLabelResolver` is available to anything that shows a status.
- Workspace settings: extend the existing tenant profile and settings update so that name, default language, time zone, date format and currency are edited under `settings.manage` and audited (FR-SET-09). The existing `TenantProfileStore` and `SettingsService` already hold most of this.

**Frontend**
- Settings → Lists → Follow-up intervals and → Lost-deal reasons, using the `LookupListEditor`.
- Settings → Statuses: two fixed lists with label, colour picker and reorder. Contract and payment badges across the app read their label and colour from the resolver, so renaming "Active" changes it everywhere (FR-SET-07 acceptance).
- Settings → Workspace: the general settings form. Date and number formatting across screens follows it (FR-LNG-04).

**Tests**
- Existing contract and payment tests stay green after the key migration.
- The migration maps every old key, with no unmapped rows.
- Renaming a status label changes the API label, and the key stays the same.

**Done when:** Every list in SRS §5.2 is editable from the admin panel. A fresh installation is usable with the seed data alone (FR-SET-10).

---

### Slice 11 — Company record: new fields, risk derivation, location

**Goal:** A company can be created and edited with business type (the risk level follows automatically), number of employees, area and city from the predefined lists, street address, NIPT and client status. The list can be searched and filtered by these fields.

**Requirements:** FR-CMP-01, 02, 03, 06 (filters), 07, 09 · FR-AUD-02 (reassign, delete) · UAT-2 (company part)

**Depends on:** 4, 8, 9

**Data**
- `Client` gains `businessTypeId`, `employeeCount`, `areaId`, `cityId`, `streetAddress`, `taxId`, `website`. The new foreign keys are nullable at the database level until Slice 14 fills existing rows. The application requires them for new and edited companies.
- Unique `(tenantId, taxId)` when filled (Q8). Indexes on `(tenantId, businessTypeId)`, `(tenantId, areaId, cityId)` and `(tenantId, assignedUserId)` (the last exists already).
- Risk level is **not stored**. It is read through the business type (SRS §7.1). Existing quotations and contracts keep their own copied values (FR-CMP-07).
- Client status: the fixed set Lead, Prospect, Client, Former client (Q9) on the existing `STATUS` FieldRole field, which becomes a locked system field (D7).

**Backend**
- Domain rules on the `Client` entity:
  - A business type is required and must be active when chosen.
  - `employeeCount` is at least 1.
  - An area and a city are required, and the city must belong to the area. Changing the area without a matching city is rejected.
  - The email and phone formats are validated.
  - A duplicate company name gives a warning, not an error (the response carries `warnings[]`).
- The risk level on reads is resolved from the business type, and the API returns it read-only. No write path accepts a risk level.
- Search and filters (FR-CMP-06): business type, risk level (through business type), area, city, salesperson and status, combined with the Slice 4 scope. The search matches name, phone and email. Contact name and phone search come in Slice 12.
- Reassigning the salesperson needs `companies.reassign` and is audited. Soft delete through the existing `ArchiveClientUseCase` needs `companies.delete` and is audited (FR-CMP-09).
- Validation messages are translation keys, so they appear in the user's language.

**Frontend**
- `ClientFormContent`: new sections for business type (with a read-only risk badge that updates live), employees, area and city (cascading; changing the area clears the city; no free typing), street address, NIPT and website.
- `ClientListContent`: filter chips for the new fields, and risk and area columns.
- `ClientDetailContent`: the new fields shown with translated lookup labels.

**Tests**
- A domain test: changing the business type changes the derived risk.
- A domain test: a city from another area is rejected.
- An integration test: create and edit with every required field; a missing field returns a translated error; each filter narrows results correctly; filters respect scope.
- A performance test with 10,000 seeded companies: list and search return in under 1 s (NFR-PERF-01, measured again in Slice 15).

**Done when:** UAT-2 steps 1 (without contacts), 2 and 3 pass.

---

### Slice 12 — Contact persons

**Goal:** A company has one or more named contacts with position, phone and email, and exactly one of them is primary. Reception can find a company by a contact's phone number.

**Requirements:** FR-CMP-04, FR-CMP-06 (contact search) · NFR-SEC-03 · UAT-2 (contacts), UAT-1 step 4

**Depends on:** 11

**Data**
- `ContactPerson (id, tenantId, clientId, name, position, phone, email, isPrimary, createdAt, updatedAt, deletedAt)`. Index on `(tenantId, clientId)`, plus search indexes on phone and email.

**Backend**
- The domain aggregate on `Client` enforces the rules: at least one contact, and exactly one primary. Removing the primary contact requires choosing another. Adding the first contact makes it primary automatically.
- Use cases: add, edit and remove contacts, and set a contact as primary. These fall under `companies.edit` (scoped) and are visible under `companies.view`, which means Reception can see them (matrix §4.2).
- Creating a company accepts its initial contacts in the same transaction, so a company with zero contacts can never be saved.
- The company search is extended to match contact name, phone and email (FR-CMP-06).
- GDPR (NFR-SEC-03): contacts are soft-deleted and left out of reads. Where the data is hosted (EU) is recorded in Slice 15.

**Frontend**
- A contacts section on the company form (repeatable rows, primary radio) and on the detail page (a card list, click-to-call, click-to-email).
- The search box on the company list searches contact fields too.

**Tests**
- A domain test for the primary-contact rules. An integration test: Reception finds a company by a contact's phone and sees the contacts but no commercial fields.

**Done when:** UAT-2 is complete (two contacts with positions) and UAT-1 step 4 passes on real contact data.

---

### Slice 13 — Unified company history timeline

**Goal:** The company page shows one timeline, newest first, of contacts added, notes, activities (calls, emails, visits, meetings), offers (quotations) and contracts, filterable by type. Deals slot in during Milestone 2.

**Requirements:** FR-CMP-05

**Depends on:** 12

**Backend**
- Extend `shared/application/TimelineMerger.ts` and `GetClientHistoryUseCase`. Today they merge interactions, appointments and client edits. They gain these sources:
  - `ContactPerson` added or removed.
  - `QuotationStatusHistory` and quotation creation.
  - `Contract` creation and `ContractStatusHistory`.
  - Payment events only for users with `payments.view`.
- Each source is a small `TimelineSource` adapter behind a port, so M2 adds a deals source without touching the merger.
- Filter by `type[]`, with cursor pagination.
- Every entry passes through the Slice 4 scope and redaction. Reception sees notes and contract validity events without amounts. Sales users see only their own companies' timelines.

**Frontend**
- `ClientDetailContent`: one timeline component with type filter chips, an icon per type, and translated labels for every event type.

**Tests**
- An integration test: a company with an interaction, a note, an appointment, a quotation and a contract returns all of them in date order. The type filter works. Reception's timeline has no amount fields.

**Done when:** Every existing interaction, quotation and contract of a company appears in its timeline (FR-CMP-05 acceptance).

---

### Slice 14 — Legacy client data migration

**Goal:** Existing client records move onto the new model without data loss, and a report lists what still has to be completed by hand.

**Requirements:** FR-CMP-08 · NFR-OPS-01

**Depends on:** 11, 12

**Backend**
- A script in `backend/scripts/` (idempotent, dry-run by default, `--apply` to write) that:
  1. Maps legacy columns and `customFieldValues` onto the new columns wherever a custom field clearly matches, e.g. a field named "Business type", "Qyteti" or "City". The mapping table is a reviewed config file, not guessed at runtime.
  2. Creates a primary `ContactPerson` for every client that has a primary email or phone but no contact.
  3. Leaves unmapped custom values in place, so they stay visible as custom fields.
  4. Writes a CSV report of clients missing a business type, area, city, employee count or contact.
- It runs on PostgreSQL and on a MySQL copy. A database backup comes first, and rollback is either the backup or the script's reverse mode.

**Frontend**
- A "needs completion" filter on the company list (companies missing required new fields), so the sales team can work through the report inside the app.

**Tests**
- Script tests on a fixture tenant: dry run changes nothing, apply is idempotent, and the counts reconcile (records before = records after, and no custom value is lost).

**Done when:** A dry run on a copy of production data succeeds, and the report has been reviewed with Wellness Albania (FR-CMP-08, NFR-OPS-01 acceptance).

---

### Slice 15 — Milestone hardening & UAT readiness

**Goal:** Staging is ready for Wellness Albania to run UAT-1 to UAT-5 with one user per role.

**Requirements:** NFR-SEC-01, 02, 03 · NFR-PERF-01 · NFR-USE-01 · NFR-MNT-01 · NFR-OPS-01 · all UATs

**Depends on:** all

**Work**
- The role × endpoint matrix test from Slice 3 runs in CI and covers every route, including routes added in Slices 5–14.
- Run `/security-review` on the milestone diff. Check bcrypt, the JWT cookie flags and HTTPS on staging (NFR-SEC-02).
- Document the hosting location (EU) and the personal-data processing in `deploy/` (NFR-SEC-03).
- Measure performance on staging with 10,000 seeded companies. Measure the time added by the permission check (NFR-PERF-01).
- Device pass on Chrome desktop, Safari on iPhone and Chrome on Android for every M1 screen at 360 px (NFR-USE-01).
- Traceability check: every Must requirement has at least one test whose name carries its ID (NFR-MNT-01). A small script can grep test names against the SRS ID list.
- Run the migration rehearsal (Slice 14) and `mysql_upgrade_to_current.sql` on a production copy.
- Seed staging with the UAT users (Sales User A and B, Sales Manager, Reception, Administrator, CEO) and data that lets every UAT step run.
- Replace the placeholder seed lists with Wellness Albania's real lists if they have arrived (SRS §8.3).

**Done when:** UAT-1 to UAT-5 pass on staging, run by the team, and the milestone is handed to Wellness Albania for sign-off.

---

## 5. Inputs needed from Wellness Albania, by slice

| Input (SRS §8.3) | Needed by | If late |
|---|---|---|
| SVG logo, brand guidelines (colours, fonts, login image) | Slice 1 | Ship with the logo-derived palette; swap the tokens later |
| Business types with their risk levels | Slice 8 | Placeholder seed; the Administrator replaces it in the UI |
| Areas and cities (and which cities belong to each area) | Slice 9 | Placeholder qarqe/cities seed |
| Lost-deal reasons | Slice 10 | SRS defaults |
| Confirmation of D6 (`WAIVED` payment status) | Slice 10 | Keep `WAIVED` as a hidden legacy key |
| Names and emails of first users and their roles | Slice 15 | UAT test users only |
| Answers to Q1–Q9 (see D9) | Slices 4, 9, 11, 12 | Proposed defaults apply |

---

## 6. Traceability: requirement → slice

Together, the slices cover every requirement and UAT scenario in the SRS.

| Requirement | Slice(s) |
|---|---|
| FR-BR-01, 02, 03, 04, 05 | 1 |
| FR-LNG-01 | 1 |
| FR-LNG-02 | every slice (rule 5); CI gate added in 1 |
| FR-LNG-03 | 8 (framework), 9, 10 |
| FR-LNG-04 | 1 (defaults), 10 (workspace settings) |
| FR-USR-01, 02, 04, 05, 06 | 5 |
| FR-USR-03 | 3 (per-request resolution), 5 |
| FR-RBAC-01, 02, 05, 07, 09 | 3 |
| FR-RBAC-06, 11, 12, 13, 14 | 4 |
| FR-RBAC-03, 04, 08, 10 | 6 (08 guard reused in 5) |
| FR-CMP-01, 02, 03, 07, 09 | 11 |
| FR-CMP-04 | 12 |
| FR-CMP-05 | 13 |
| FR-CMP-06 | 11 (filters), 12 (contact search) |
| FR-CMP-08 | 14 |
| FR-SET-01, 02 | 8 |
| FR-SET-03, 04 | 9 |
| FR-SET-05, 06, 07, 08, 09 | 10 |
| FR-SET-10 | 8, 9, 10 (seeds); 15 (real lists) |
| FR-AUD-01, 03, 04, 05, 07 | 2 |
| FR-AUD-02 | 2 (contracts, payments), 5 (users), 6 (roles), 8–10 (settings), 11 (reassign, delete) |
| FR-AUD-06, 08 | 7 |
| NFR-SEC-01 | 3, 4, 15 |
| NFR-SEC-02 | existing; verified in 15 |
| NFR-SEC-03 | 12, 15 |
| NFR-PERF-01 | 11, 15 |
| NFR-USE-01 | every slice (rule 8); verified in 15 |
| NFR-I18N-01 | 1, every slice |
| NFR-MNT-01 | every slice (rule 1); verified in 15 |
| NFR-OPS-01 | every schema change (rule 3); 14, 15 |
| UAT-1 Each role sees only what it should | 3, 4, 12 |
| UAT-2 Company with new fields | 11, 12 |
| UAT-3 Setting change in audit log | 6, 7, 8, 9 |
| UAT-4 Language and branding | 1, 8 |
| UAT-5 Role change and deactivation | 5 |
