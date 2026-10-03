# Tracked Follow-Ups / Known Technical Debt

Items deliberately deferred rather than forgotten. Each entry states the actual
risk, not just the symptom, so whoever picks it up can judge priority for
themselves.

---

## TD-001 — Integration test fixtures share hardcoded IDs and wipe tables unscoped

**Status:** Open
**Raised:** 2026-07-26, during Phase A Step 1 (test suite stabilization)
**Severity:** Medium — not currently causing failures, but the safety margin is thinner than it looks
**Area:** `backend/tests/integration/**`, `backend/src/**/*.test.ts`

### What was fixed, and what was not

Phase A Step 1 made the suite green and deterministic in both parallel and
serial execution by giving **each Jest worker its own Postgres schema**
(`backend/tests/setup/perWorkerDb.ts`, `globalSetup.ts`, wired in
`jest.config.ts`). That fixed the *cross-worker* collisions that were causing
13 suites / 48 tests to fail in parallel while only 5 failed in serial.

It did **not** fix the underlying fixture design. It made the existing design
survivable rather than correct.

### The actual remaining risk

Two independent bad practices are still present in the suite:

**1. Suites share hardcoded fixture IDs.** These suites all use tenant id
`'t1'` (and overlapping ids like `'u1'`, `'c1-t1'`):

- `tests/integration/appointments/appointmentRoutes.test.ts`
- `tests/integration/clients/clientRoutes.test.ts`
- `tests/integration/integrations/integrationRoutes.test.ts`

### Evidence this is not theoretical — it cost real time during the follow-up pass

`tests/integration/inventory/categoryCleanup.test.ts` was first written with the
same bare `deleteMany()` teardown as the suites listed below, copied from the
neighbouring file. The full parallel run then failed with **7 tests down in
`inventoryE2E.test.ts`** — a file that had not been touched — and **passed on
re-run**, and passed when the two files were run together in isolation.

That is the whole hazard in one incident: per-worker schemas mean a worker's
schema is shared by every *file* assigned to it, so an unscoped wipe deletes a
neighbour's fixtures, and the resulting failure lands in an innocent file and
does not reproduce on demand.

The new file was rewritten to track the tenant ids it creates and delete only
those. **The suites below still have the original pattern** — this near-miss is
an argument for doing this item, not evidence that it is handled.

**2. Suites truncate tables without any tenant scoping.** These issue bare
`deleteMany({})` against entire tables in `beforeAll`/`afterAll`, which wipes
everything in the schema regardless of who owns it:

| Suite | count of unscoped `deleteMany({})` |
|---|---|
| `tests/integration/appointments/PrismaAppointmentRepository.test.ts` | 25 |
| `tests/integration/tenant/PrismaTenantRepository.test.ts` | 26 |
| `tests/integration/dashboard/dashboardRoutes.test.ts` | 7 |
| `tests/integration/tenant/tenantRoutes.test.ts` | 7 |
| `tests/integration/appointments/appointmentRoutes.test.ts` | 4 |

**Why this is not failing today:** Jest assigns each *worker* a private schema,
and within a single worker it runs suites **sequentially**, one fully finishing
before the next begins. So two suites that share id `'t1'` never touch the
schema at the same time. The isolation currently comes from Jest's execution
model, not from the fixtures themselves.

**Why that is fragile:** the suite is one step away from breaking again, and the
failure mode would be the same confusing non-determinism as before —

- Any move to intra-file concurrency (`test.concurrent`, or a future Jest
  default) removes the sequential guarantee immediately.
- State leaks between suites sharing a worker are already possible: a suite that
  fails partway through leaves rows behind under ids the *next* suite in that
  worker also uses, producing order-dependent passes/failures that reproduce
  only under a specific worker assignment.
- Worker assignment is not stable across runs, so any such bug surfaces
  intermittently and looks like flakiness rather than a fixture bug.
- The `deleteMany({})` calls mean a suite cannot safely assume anything it
  seeded still exists if another suite ran in between.

### Suggested fix

Namespace fixtures per suite instead of relying on execution order. Either:

- derive a unique prefix per suite (e.g. `t-${path.basename(__filename)}`) and
  use it for every id the suite creates; **and**
- replace every unscoped `deleteMany({})` with one scoped to that suite's own
  tenant id.

A shared `tests/setup/fixtures.ts` helper offering `uniqueTenantId()` +
`cleanupTenant(prisma, tenantId)` would let suites be migrated incrementally
rather than in one large change.

### Operational note on the current setup

`globalSetup.ts` provisions exactly `globalConfig.maxWorkers` schemas
(`test_w1..test_wN`) and migrates each. Schemas are intentionally **not**
dropped on teardown so reruns stay fast (`prisma migrate deploy` is a no-op once
current). If a migration is ever applied manually to only one schema, run the
full suite once to bring the rest back to head.

### Coda: this failure mode actually materialized (2026-07-26, Phase B Group 1)

Not theoretical. It happened, exactly as described above.

`tests/integration/tenant/superAdminTenantScope.test.ts` was written during
Phase A Step 3 using the hardcoded slugs `'tenant1'` / `'tenant2'` — the **same
literals** `tests/integration/inventory/inventoryRoutes.test.ts` creates. That
file's `afterAll` only calls `$disconnect()`, so its tenant rows persist in the
worker schema after it finishes.

It passed for two phases anyway, because the new file's own **unscoped
`deleteMany({})` was silently wiping the leftover rows first**. When that was
replaced with scoped teardown (the correct fix, per this entry's own
recommendation), the accidental protection disappeared and the real collision
surfaced:

```
Unique constraint failed on the fields: (`urlSlug`)   ×32
```

— failing 2 suites / 25 tests **in parallel only**, while serial passed. Precisely
the intermittent, worker-assignment-dependent signature predicted above.

**Two lessons worth carrying:**

1. **Unscoped `deleteMany({})` does not just risk destroying other suites' data
   — it actively hides fixture collisions.** Every one of those calls is
   potentially masking a latent conflict that will surface the moment someone
   does the right thing and scopes the cleanup. Expect this when migrating the
   suites listed above; a suite failing right after its teardown is scoped is
   evidence of a pre-existing collision, not of a bad migration.
2. **Fix the fixtures, not the teardown.** The correct repair was namespacing
   slugs and emails per run (`scope-a-${uuid.slice(0,8)}`), not restoring the
   global wipe. Both new files now do this and pass three consecutive parallel
   runs plus serial.

---

## TD-002 — RESOLVED (batch pass): test doubles drifted because `tests/**` was never typechecked

**Status:** 🔴 **OPEN — CONFIRMED RECURRING (3×). Address this FIRST once Group 3
wraps, ahead of TD-011.**
**Raised:** 2026-07-26, during Phase A Step 1
**Severity:** Medium-High — no longer a hypothesis; an empirically proven,
repeating gap that has broken the build three separate times
**Area:** `backend/tests/**`, `backend/tsconfig.json`

### Why this is now first in the queue

This has recurred **three separate times**, every one with the same root cause
and every one missed by `tsc --noEmit` for the same reason: **`tsconfig.json`
excludes `tests/`**, so the main typecheck never looks at the files that break.
Each recurrence surfaced only when Jest happened to compile the suite at run
time — i.e. late, and only because a full run was performed.

| # | When | What changed | What broke |
|---|---|---|---|
| 1 | Phase A Step 1 | `updateRoleAndWarehouse` on `IUserRepository`, `delete` on `IInvitationRepository`, `warehouseId` on `req.user` | 5 suites had silently stopped compiling — including `resolveTenant.test.ts` and `authorize.test.ts`, the core tenant-isolation tests |
| 2 | Group 2 Item 2 | `setActive` + `countAssignedWork` added to `IUserRepository` | 7 hand-written doubles; `tsc` caught only one, the rest surfaced under ts-jest. `LoginUseCase.test.ts` literals lacked `isActive`, so `!undefined` denied login |
| 3 | Group 3 Item 1 | `currency`/`locale`/`timezone`/`dateFormat` added to `Tenant` | 2 `ITenantRepository` doubles built as object literals; 2 integration suites failed to run |

**It is ordered ahead of TD-011 deliberately.** TD-011 is the more serious defect,
but its fix requires careful, deliberate work across 10 routes with a real
behaviour-change audit. TD-002's actual fix is comparatively small — and would
have caught all three recurrences immediately, for free, from the moment it
landed. Cheap guardrail first; expensive correctness work second.

### The fix, in priority order

1. **Add `tests/**` to a `tsc --noEmit` check in CI.** This is the whole point:
   it is small, mechanical, and catches this entire class at the moment of
   introduction rather than at the next full test run. Likely a second
   `tsconfig.test.json` extending the base with `include: ["src/**/*", "tests/**/*"]`,
   wired to a `typecheck:tests` script that CI runs.
2. Then migrate the hand-written doubles to generated ones (`jest-mock-extended`'s
   `mock<IFoo>()`, already a devDependency), which makes both drift classes
   structurally impossible rather than merely detected.

Recurrence 3 was fixed by a third approach worth noting: the two `ITenantRepository`
doubles now call `Tenant.create(...)` instead of building object literals, so a
future entity field cannot break them at all. That works where a real constructor
exists, but it is a per-site fix — it does not generalise the way (1) does.

### Original detail

Five suites had silently stopped compiling (and therefore stopped running)
because hand-written mocks drifted from interfaces that had changed:
`updateRoleAndWarehouse` on `IUserRepository`, `delete` on
`IInvitationRepository`, and `warehouseId` on `req.user`. Among them were
`resolveTenant.test.ts` and `authorize.test.ts` — the core tenant-isolation
middleware tests. They have since been fixed and all pass, so no isolation
regression was hiding there, but the suite gave no signal that they had gone
dark for an extended period.

A related variant: doubles built as bare `jest.fn()` return `undefined` where
the interface declares `Promise<void>`. Production code that legitimately
fire-and-forgets (`.catch()` without `await`) then throws `TypeError: Cannot
read properties of undefined (reading 'catch')` inside the *test only*. This bit
both `RequestPasswordResetUseCase.test.ts` and `InviteStaffUseCase.test.ts`.

(See "The fix, in priority order" above — this variant is also eliminated by
generated doubles, since `mock<IFoo>()` returns auto-resolving promises.)

---

## TD-003 — Email credential exposed in git history (rotate, do not rewrite)

**Status:** Open — **owner action required (account-level, not a code change)**
**Raised:** 2026-07-26, during Phase A Step 2 (security hardening)
**Severity:** High — a live credential is readable by anyone with repo access
**Area:** git history, `backend/.env` (no longer tracked)

### What was found

`backend/.env` was tracked in roughly ten commits and removed in `bf8c1ca`
("feat: implement invitation acceptance flow and email notifications"). It is
**not** in `HEAD` today and is correctly ignored now, but the blobs remain
reachable in history. Contents at the last committed revision (inspected by key
name and value length only; values were never printed):

| Key | Length | Assessment |
|---|---|---|
| `EMAIL_PASS` | 21 | **Real-looking credential — this is the exposure** |
| `EMAIL_USER` | 25 | A `@gmail.com` address |
| `DATABASE_URL` | 49 | Points at `localhost` — local dev only, low risk |
| `VITE_API_URL` (in `frontend/.env`) | 62 | An API endpoint URL, not a secret |

**`JWT_SECRET` was never committed, in any file, in any commit.** Verified with
`git grep JWT_SECRET $(git rev-list --all)`; the only hits are source references
to `process.env.JWT_SECRET`. This matters because Step 2 found that dev and
production had been running on the hardcoded `'secret'` fallback — but that
weakness did **not** compound into a leaked signing key.

### Recommendation: rotate, do not rewrite history

**Rotate the Gmail App Password for the sending account.** If the repository was
ever cloned, forked, or pushed to a remote — and it was — then rewriting history
does not retract anything that has already been copied. Rotation is what
actually closes the exposure; history rewriting only reduces future casual
discovery, at the cost of breaking every existing clone and requiring a
coordinated force-push. Rotation is fast, safe, and sufficient. Treat a history
rewrite as an optional, separate hygiene decision, not as the remediation.

`DATABASE_URL` needs no action: it is a `localhost` connection string with a
local-only password.

### Owner action item

Rotating the Gmail App Password is an account-level action outside the codebase
and is owned by the repository owner. No code change will complete this item.

---

## TD-004 — RESOLVED: repo-root `.gitignore` did not cover a root-level `.env`

**Status:** Closed 2026-07-26 (fixed in the same pass that raised it)

The root `.gitignore` patterns `*/.env` and `*/.env.*` both require a directory
prefix, so a bare repo-root `.env` would not have matched and would have been
tracked. No such file existed, so nothing was ever exposed through this gap.

Fixed by adding bare `.env` and `.env.*` lines to the root `.gitignore`.
Verified with a temporary probe file: `git check-ignore -v .env` now reports
`.gitignore:3:.env`. Recorded here only so the reasoning behind those lines is
not lost and they are not "tidied away" later as redundant — they are not
redundant with the `*/`-prefixed patterns.

Note that the per-directory `backend/.gitignore` and `frontend/.gitignore` are
what actually cover the real env files today (`git check-ignore -v backend/.env`
cites `backend/.gitignore:6`), so the root patterns are a second layer rather
than the primary defence.

---

## TD-005 — Dead SUPER_ADMIN branches in tenant-scoped authorization checks

**Status:** Open
**Raised:** 2026-07-26, during Phase A Step 3 (Super Admin tenant-scope fix)
**Severity:** Low — unreachable and harmless today; a clarity and audit-safety risk
**Area:** `backend/src/**` application-layer use cases and one route guard

### Background

Phase A Step 3 removed the `SUPER_ADMIN` exemption from `resolveTenant`. Tenant
scoping is now absolute: any request to `/:tenantSlug/...` whose token
`tenantId` does not match the URL-resolved tenant gets a 403, with no role-based
exception. `SUPER_ADMIN` has a null `tenantId`, so it is now denied on every
tenant-scoped route.

`resolveTenant` runs **before** these checks in the middleware chain, so the
role branches below can no longer be reached by a `SUPER_ADMIN`.

### The now-unreachable branches

Each grants `SUPER_ADMIN` permission alongside `BUSINESS_OWNER`:

| Location | Form |
|---|---|
| `src/auth/application/use-cases/InviteStaffUseCase.ts:16` | `!== BUSINESS_OWNER && !== SUPER_ADMIN` |
| `src/auth/application/use-cases/GetPendingInvitationsUseCase.ts:9` | `!== BUSINESS_OWNER && !== SUPER_ADMIN` |
| `src/auth/application/use-cases/CancelInvitationUseCase.ts:9` | `!== BUSINESS_OWNER && !== SUPER_ADMIN` |
| `src/auth/application/use-cases/UpdateUserRoleUseCase.ts:15` | `!== BUSINESS_OWNER && !== SUPER_ADMIN` |
| `src/clients/application/use-cases/DefineCustomFieldUseCase.ts:20` | `!== BUSINESS_OWNER && !== SUPER_ADMIN` |
| `src/clients/application/use-cases/DefineOutcomeCategoryUseCase.ts:17` | `!== BUSINESS_OWNER && !== SUPER_ADMIN` |
| `src/integrations/interfaces/http/integrationRoutes.ts:21` | `authorize([BUSINESS_OWNER, STAFF, SUPER_ADMIN])` |

### Why this is a cleanup item, not a bug

Nothing is broken. `resolveTenant` blocks first, so these branches cannot grant
access they should not. Behaviour is correct today and covered by
`tests/integration/tenant/superAdminTenantScope.test.ts`.

### Why it is still worth doing

**Dead role checks inside security-relevant guards are exactly the stale code
that misleads the next person auditing this area.** Someone reading
`InviteStaffUseCase` in isolation will reasonably conclude a Super Admin can
invite staff into any tenant — the opposite of the actual, deliberate policy.
That misreading is most likely during a security review, which is precisely when
being wrong is most expensive. It also invites a bad repair: if someone later
"fixes" a Super Admin 403 by loosening `resolveTenant` rather than reading these
call sites, the original bypass comes straight back.

### Suggested fix

Remove `SUPER_ADMIN` from each condition so the checks state the real policy
(`BUSINESS_OWNER` only for the six use cases; drop `SUPER_ADMIN` from the
`authorize([...])` list on `integrationRoutes.ts:21`).

**Care required:** these conditions are still live for `BUSINESS_OWNER`, so each
edit must preserve that path. Do not delete the guards wholesale — only the
`SUPER_ADMIN` term. Run the full suite after; the existing use-case unit tests
cover the `BUSINESS_OWNER` and `STAFF` paths.

**Consistency note:** `ConnectIntegrationUseCase` and
`DisconnectIntegrationUseCase` already *explicitly deny* `SUPER_ADMIN`
(`authorRole === SUPER_ADMIN` → unauthorized). That module was independently
consistent with the policy before Step 3 made it global, and is the pattern the
others should match.

---

## TD-006 — `req.user!.role as any` casts away enum checking at 24 call sites

**Status:** Open
**Raised:** 2026-07-26, during Phase B Group 1 (found while auditing `as any` usage)
**Severity:** Low-Medium — no known live bug; removes compile-time protection on a security-relevant value
**Area:** `backend/src/**/interfaces/http`

### What it is

24 call sites pass the caller's role into a use case as `req.user!.role as any`:

| File | Count |
|---|---|
| `src/inventory/interfaces/http/inventoryController.ts` | 23 |
| `src/auth/interfaces/http/controllers/AuthController.ts` | 1 |

The cast exists because `req.user.role` is typed `string` (see the `Express.Request`
augmentation in `src/main/interfaces/http/middlewares/authenticate.ts`) while the
use cases expect the `UserRole` union:

```ts
export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  BUSINESS_OWNER: 'BUSINESS_OWNER',
  STAFF: 'STAFF',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
```

`as any` silences the mismatch instead of resolving it.

### Why it matters

**Role is an authorization input, and `as any` removes the compiler's ability to
check it.** With the cast in place, a typo (`'BUSSINESS_OWNER'`), a stale value
after a role is renamed, or a genuinely invalid string all compile cleanly and
fail silently at runtime — a role comparison that never matches usually means a
permission check that quietly denies, or in the wrong branch shape, quietly
allows. This is the same category of problem as the `(req as any).user?.role`
cast removed from `tenantRoutes.ts` during Phase B Group 1: the moment that cast
was removed, the compiler immediately surfaced a real latent type gap
(`req.user` being optional) that the cast had been hiding. There is no reason to
expect these 24 to be different.

No live bug is known — the values flowing through are real roles from a signed
JWT — so this is a hardening item, not an outage risk.

### Suggested fix

Type the source rather than casting at every use. Narrow the
`Express.Request['user'].role` augmentation in `authenticate.ts` from `string` to
`UserRole`, then delete all 24 casts. The token payload is already typed as
`UserRole` in `TokenPayload` (`src/auth/application/ports/ITokenService.ts`), so
the augmentation is the only place the type is widened — fixing it there is a
one-line change that removes every cast downstream.

**Care required:** `authenticate.ts` populates `req.user` from
`tokenService.verify()`, whose return type is already `TokenPayload`. Confirm no
caller depends on assigning an arbitrary string to `req.user.role` (test doubles
included — see [TD-002], several construct `req.user` by hand) before narrowing.

### Explicitly out of scope when found

Discovered during the Phase B Group 1 `as any` audit, whose remit was tenantId
sourcing. These casts are on `role`, not `tenantId`, so they were deliberately
left alone rather than folded into an unrelated pass.

---

## TD-007 — SINGLE_SELECT custom fields cannot be created from the UI

**Status:** Open
**Raised:** 2026-07-26, during Phase B Group 1 Item 2 (deferred by decision, not overlooked)
**Severity:** Low — a valid backend capability with no way to reach it
**Area:** `frontend/src/pages/settings/ClientSettingsContent.tsx`

### What is missing

`SINGLE_SELECT` is a fully supported backend `FieldType`: the domain entity
validates it, the request schema accepts it, and the repository persists its
`options` array. It is simply absent from the settings dropdown, which offers
only TEXT / NUMBER / DATE / BOOLEAN.

Adding it to the dropdown alone would **not** work. Both the request schema and
the domain entity reject a SINGLE_SELECT with an empty `options` list:

- `src/clients/interfaces/http/schemas/clientSchemas.ts` — `.refine(...)`,
  "Options are required for SINGLE_SELECT fields"
- `src/clients/domain/entities/CustomFieldDefinition.ts` — same rule in `create`

So the dropdown entry and an options editor have to ship together, which is why
this was deferred rather than folded into the BOOLEAN fix: it is new UI, not a
bug fix.

### What is already in place

Most of the work is done and unused:

- `frontend/src/components/ui/CustomFieldInput` already implements a `dropdown`
  variant that renders an `options` array.
- `ClientFormContent` now routes field types through `FIELD_TYPE_TO_INPUT`,
  which already maps `SINGLE_SELECT → 'dropdown'`. Rendering works the moment a
  SINGLE_SELECT field exists.
- `CustomFieldDefinition` in `frontend/src/types/client.ts` carries `options?`.

### What remains

Only the authoring UI in the settings slide-over:

1. Add `<option value="SINGLE_SELECT">` to the field-type dropdown.
2. When SINGLE_SELECT is selected, show an options editor (add / remove / reorder
   rows), disallow submission with zero options, and pass `options` through
   `defineCustomField`.
3. `useDefineCustomField` and `clientService.defineCustomField` currently accept
   `{ fieldName, fieldType }` only — widen to include `options?: string[]`.

Server-side rejection is already correct and, since Item 2, its message is now
surfaced to the user, so a mistake here fails visibly rather than silently.

---

## TD-008 — RESOLVED: SuperAdminShell's sidebar was never redesigned after Super Admin lost tenant access

**Status:** ✅ **RESOLVED, 2026-07-28**, folded into Super Admin tenant
provisioning exactly as this entry predicted it would be. See "Resolution" at
the end.

**Original entry follows.**

**Status at the time:** Open
**Raised:** 2026-07-26, during Phase B Group 1 Item 3
**Severity:** Low — cosmetic dead ends, no data or security risk
**Area:** `frontend/src/pages/shell/SuperAdminShell.tsx`, `frontend/src/hooks/useNavigation.ts`
**Natural home:** alongside Super Admin tenant management (audit item #14 — create / suspend / remove tenants)

### This is not a routing bug to patch

Phase A Step 3 established that **SUPER_ADMIN gets zero access to any individual
tenant's business data** — it is a platform-level role that administers tenants
themselves, never their Clients, Appointments, Inventory or Quotations. That
decision is correct, deliberate, and enforced in `resolveTenant` with tests in
`tests/integration/tenant/superAdminTenantScope.test.ts`.

Six dead sidebar links pointing at pages Super Admin is now *correctly forbidden
from ever reaching* is not a defect in the links. It is a sign that the shell's
navigation was never revisited after the role's remit changed. Patching it with
better routing would be fixing the wrong layer.

### Current state, concretely

`SuperAdminShell` is mounted at `/admin` and calls the shared `useNavigation`
hook. `SUPER_ADMIN` is not `'STAFF'`, so it falls through to the **owner** list:
Dashboard, Clients, Appointments, Inventory, Quotations, Reports, Settings.

Three things compound:

1. **No tenant slug in the click handler.** `SuperAdminShell` navigates with
   ``onNavItemClick={(id) => navigate(`/${id}`)}`` — no `:tenantSlug` segment,
   unlike `StaffShell` / `BusinessOwnerShell` which use
   ``navigate(`/${tenantSlug}/${id}`)``. So `/clients` matches the `/:tenantSlug`
   route with a slug of `"clients"`, not the clients page.
2. **The shell only routes two paths.** Internally it defines `/` (redirect) and
   `/dashboard`. Nothing else resolves.
3. **The backend would refuse anyway.** Since Step 3 every `/:tenantSlug/...`
   endpoint returns 403 for a null-tenant Super Admin — by design.

Net: **6 of 7 sidebar links are dead ends.** Only Dashboard works.

### Why defer rather than fix now

The right fix is a small design pass on what a platform-level shell should
actually contain — presumably Dashboard plus Tenant Management, matching the
role as defined. That pass is unavoidable when Super Admin tenant management
(create / suspend / remove tenants) is built, because the shell will need real
new links at that point regardless. Doing it twice is wasted work; folding a
redesign into a bug-fixing batch is the wrong scope.

### When picked up

- Give `SUPER_ADMIN` its own nav list in `useNavigation` rather than defaulting
  to `ownerNavItems`. Note the hook currently branches only on `role === 'STAFF'`,
  so every non-staff role silently inherits the owner list — Super Admin is just
  the case where that is visibly wrong.
- Decide the click-handler contract for a shell with no tenant context.
- `useNavigation.test.ts` already asserts no-duplicate-ids for a `SUPER_ADMIN`
  user; extend it to assert the expected link set once that set is decided.

### Resolution (2026-07-28)

Folded into the tenant provisioning feature rather than fixed separately —
this entry's own reasoning ("that pass is unavoidable when Super Admin tenant
management is built... doing it twice is wasted work") held. Splitting them
would have shipped working create/suspend/reactivate endpoints behind a shell
with nowhere to put the page.

All three compounding causes are addressed:

1. **`SUPER_ADMIN` has its own nav list**: Dashboard and Tenants, matching the
   role as defined. The hook now matches the role explicitly instead of letting
   it fall through — "not STAFF" was never a sound definition of "owner".
2. **The click handler navigates to `/admin/${id}`**, keeping a tenant-less
   shell inside its own mount point. Previously bare `` `/${id}` `` matched the
   top-level `/:tenantSlug` route with a slug of `"clients"`.
3. **The shell routes what it offers**: `/dashboard`, `/tenants`, and a
   catch-all redirect so nothing renders an empty shell.

Two things fixed along the way that were not in the original diagnosis:

- The `isActive` fallback was a hand-maintained exclusion list naming three of
  the seven destinations, so Dashboard lit up alongside Inventory, Quotations
  and Reports. It now derives exclusions from the item list, which cannot fall
  behind it.
- **TD-020's Status column is reinstated** in `TenantManagementTable`, its
  stated precondition ("reinstate alongside the billing/subscription fields
  they would read from") now met by `subscriptionStatus`. **Plan stays
  removed** — billing is still unmodelled, so TD-020 remains open for it.

`useNavigation.test.ts` asserts the exact `SUPER_ADMIN` link set, that each of
the six formerly-dead links is absent, that no other role sees Tenants, and the
active-state behaviour.

---

## TD-009 — Client list exposes no assigned-staff or status filter

**Status:** Open
**Raised:** 2026-07-26, during Phase B Group 2 Item 1 (deferred by decision)
**Severity:** Low — a required capability that exists end-to-end except for the UI
**Area:** `frontend/src/pages/clients/ClientListContent.tsx`

### What is missing

SRS §6.2 Search & Filter Clients requires two things:

- *"Search by name, contact number, or email"* — **done** in Phase B Group 2:
  a single box sending `search`, matched across all three columns in both
  repository branches.
- *"Filter results by assigned staff or client status"* — **not exposed.**

### Everything below the UI already works

- `SearchClientsFilters` has `assignedUserId` and `status`.
- `searchClientsSchema` validates both (`status` as a `ClientStatus` enum,
  `assignedUserId` as a uuid).
- `ClientController.searchClients` already forwards both to the use case.
- Both repository branches — raw-SQL and Prisma `findMany` — already apply them.

The list view simply never sends them: its effect calls
`fetchClients({ search: debouncedSearchTerm })` and nothing else. There is a
"Filter" button in the toolbar that is currently inert.

### What remains

1. Controls for status (a select over `ClientStatus`) and assignee (a select over
   the tenant staff list — `useTeam().staff` is already fetched on this page for
   the assignee column, so no new request is needed).
2. Include them in the `fetchClients` payload alongside `search`.
3. Add them to `SearchClientsParams` in `frontend/src/types/client.ts`, which
   already carries `assignedUserId` but not as something the page sends.

No backend work. Deferred because it is a small feature with its own UI design
(where the controls live, whether the inert "Filter" button opens a panel),
rather than part of closing the assignment/search gaps Group 2 was scoped to.

---

## TD-010 — No token revocation: deactivation leaves a ≤1h residual-access window

**Status:** Open
**Raised:** 2026-07-26, during Phase B Group 2 Item 2 (known limit, accepted deliberately)
**Severity:** Medium — a deactivated user retains API access for up to one hour
**Area:** `backend/src/main/interfaces/http/middlewares/authenticate.ts`, `JwtTokenService`

### The gap

`authenticate` verifies the JWT signature and trusts the payload. It never reads
the database:

```ts
const decoded = tokenService.verify(token);
req.user = decoded;
next();
```

There is therefore no point in the request path where a deactivated account can
be noticed. Staff deactivation (Phase B Group 2) revokes the ability to obtain a
**new** token; it cannot invalidate one already issued.

### What is guaranteed today, precisely

| | Status |
|---|---|
| Deactivated user cannot log in again | ✅ enforced in `LoginUseCase` |
| Cannot get a token via password reset | ✅ same check on the login path |
| Browser session drops on next `/auth/me` | ✅ added — the one authenticated path that re-reads the user; also clears the cookie |
| Already-issued token rejected immediately on other endpoints | ❌ **not possible today** |

### Addendum (2026-07-28) — tenant *suspension* has no such window

Still open for **user deactivation**, which is what this entry is about. But the
tenant-level equivalent shipped without the gap, and how it avoided it is worth
recording because the same technique applies here.

Suspending a workspace takes effect **immediately, mid-session, on
already-issued tokens** — no waiting for expiry. Not because tokens are revoked
(they still are not), but because `resolveTenant` re-reads the tenant from the
database on *every* `/api/:tenantSlug/...` request, and every tenant-scoped route
in the app is mounted under that prefix. The check costs nothing: the tenant was
already being loaded for the cross-tenant membership check.

`/api/auth/me` is the one authenticated path with no slug, so it carries its own
suspension check — mirroring the `isActive` check this entry describes.

**Why the same trick does not simply close this item:** `authenticate` never
reads the database at all, and adding a per-request user lookup there is a
different cost/benefit conversation from reusing a query that was already
happening. That remains the open question here.

### The actual exposure window

`JWT_EXPIRATION` is **`1h`** in both `.env` and `.env.test`. The 24h figure that
appears in discussion is only `JwtTokenService`'s fallback when the variable is
unset, and the *cookie* `maxAge` is 24h — but since the JWT inside expires after
an hour, the longer cookie life just means a 401 once it lapses.

**So worst-case residual access is ~1 hour, not a day.** In practice it is
usually far shorter, because any page load calls `/auth/me` and ends the session.

This limit is stated plainly in the deactivation confirmation dialog ("their
session ends the next time the app reloads, and within an hour at the latest")
rather than implying instant lockout, and is asserted by a UI test so the copy
cannot quietly drift into a false promise.

### Options, when this is worth building

1. **Token versioning (recommended).** Add `tokenVersion: Int @default(0)` to
   `User`, include it in the JWT payload, and compare against the stored value in
   `authenticate`. Deactivation (or a password change, or an explicit "sign out
   everywhere") increments it, invalidating every outstanding token instantly.
   *Cost:* one indexed read per authenticated request — cacheable, but no longer
   a zero-DB auth path.
2. **Revocation blocklist.** Keep revoked `jti`s in Redis/Postgres with a TTL of
   the token lifetime; `authenticate` checks membership. *Cost:* new
   infrastructure, but a smaller per-request read and it generalises to
   individual session revocation.
3. **Short-lived access tokens + refresh tokens.** The standard fix — reduces the
   window to the access-token lifetime and gives a natural revocation point at
   refresh. *Cost:* the largest change; reworks the whole auth flow.

Option 1 is the smallest step that closes the gap and reuses the existing JWT
flow. Worth doing if deactivation ever needs to be immediate for compliance or
for off-boarding under hostile circumstances; the current one-hour window is
acceptable for ordinary staff turnover.

---

## TD-011 — RESOLVED (follow-up pass): parsed result assigned back, closing a mass-assignment gap

> **CORRECTION (batch pass, verified before proposing a fix).** The heading of
> this entry used to claim that **every** `.default()` and `.transform()` in the
> codebase is inert. **That is false**, and the correction changes the priority.
>
> `validateRequest` is used on **9 routes, all of them in `authRoutes.ts`** —
> not 10 spread across the codebase. And **none of the nine auth schemas
> contains a single `.default()`, `.transform()` or `.coerce`**: they are plain
> `z.object`s of strings and enums. So on the routes that use the broken
> middleware, there is nothing to lose by discarding the parse result.
>
> Every schema that *does* use `.default()` / `.transform()` / `z.coerce`
> (appointments, clients, quotations, inventory, settings) is parsed **inside
> the controller** via `Schema.parse(req.body)` with the **return value used** —
> e.g. `const validatedData = createClientSchema.parse(req.body)`. Those
> defaults and transforms apply correctly today.
>
> **Nothing is currently broken by this.** It is a loaded trap, not a live
> defect: the next auth schema that gains a `.default()` will silently do
> nothing. The real structural problem is the one this reveals — **two
> different validation patterns coexist**, with two different 400 response
> shapes (see below). Repriced from PRIORITY to a real but non-urgent
> structural item.

### The defect

`backend/src/main/interfaces/http/middlewares/validateRequest.ts`:

```ts
export const validateRequest = (schema: AnyZodObject) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.body);   // <-- result is never assigned
      return next();
    } catch (error) {
      return res.status(400).json(error);
    }
  };
```

Zod does not mutate its input. `parseAsync` returns a **new** object carrying
defaults, coercions and transforms; that return value is thrown away and
`req.body` is left exactly as the client sent it. Validation works. Everything
else the schema declares does not.

### The blast radius, stated plainly

**Any schema anywhere in this codebase that uses `.default()` or `.transform()`
is currently non-functional.** The declaration is read, applied, and discarded.
A developer writing `z.string().optional().default('en')` today gets validation
and nothing else, with no error and no warning — the schema *looks* correct at
the definition site and at the call site, and is silently inert in between.

`validateRequest` is used by **10 routes** across auth and elsewhere.

### Why this is the root cause, not an isolated bug

The same shape has now been found three times:

- **`locale` on registration** (Group 3 Item 1). `authSchemas.register` declared
  `locale: z.string().optional().default('en')`. Even if
  `RegisterBusinessOwnerUseCase` had read `input.locale`, the default would never
  have arrived — the parsed object holding it was discarded here. Two independent
  defects stacked on the same field.
- Plus at least one earlier instance of the same accepted-then-dropped pattern
  found earlier in this project.

Each was diagnosed as a local bug. They are symptoms of this one line.

### Why it was not fixed inside Group 3 Item 1

Deliberate, and the reasoning should survive: the middleware is shared by ten
routes **written against the broken semantics**. Making defaults suddenly start
landing would change the request body seen by handlers that have only ever
observed raw input — including handlers that may compensate for a missing
default themselves. That is a behaviour change across ten endpoints, and it
belongs in its own pass with its own tests, not folded into a settings feature.

`UpdateTenantSettingsUseCase` works around it by re-parsing with the schema
itself, so its trimming and empty-string-to-null normalisation actually take
effect. That workaround is documented at the call site and should be removed
when this is fixed.

### The fix, when taken up

1. Assign the parsed result: `req.body = await schema.parseAsync(req.body);`
2. **Audit all 10 routes first** — for each, diff what the handler receives
   before and after, and confirm no handler is compensating for an absent
   default.
3. Grep for every `.default(` and `.transform(` in `src/**/schemas/**` and
   confirm each is either intended or removed. Anything currently inert is by
   definition untested.
4. Also worth fixing while in there: the catch block does
   `res.status(400).json(error)`, returning the raw `ZodError`. It happens to
   serialise to `{ issues: [...] }`, which the frontend's `extractApiErrorMessage`
   handles — but that is a coincidence of Zod's shape, not a designed contract.

---

## TD-012 — RESOLVED (Group 3 Stage 4): dates and timezone are now consumed

**Timezone is fully wired**; see TD-025 for the live defect that closing this
uncovered and fixed. `dateFormat` is deliberately still not consumed — see the
note at the end of this entry.

Original entry follows.

## TD-012 (original) — Dates and timezone are stored but not consumed anywhere (~20 sites)

Group 3 Item 1 added `timezone` and `dateFormat` to `Tenant` (NOT NULL, defaults
`UTC` and `MM/DD/YYYY`) but deliberately scoped consumption to **currency only**.
Nothing reads either column yet.

Because of that, both controls are **left visibly disabled** in Company Settings
rather than enabled-but-ignored. Letting someone select `DD/MM/YYYY` and then
rendering `MM/DD/YYYY` anyway would be a new instance of exactly the problem
that page was rebuilt to fix. The columns exist so this becomes a pure
consumption pass with no second migration.

### What needs to start reading them

Roughly 20 call sites across 4 features, all currently bare
`toLocaleDateString()` / `toLocaleString()` / `toLocaleTimeString()` calls that
follow the *viewer's browser*, not the workspace:

- Appointments — `CalendarContent.tsx` (9 sites), `AppointmentDetailPanel.tsx` (2)
- Quotations — `QuotationListContent.tsx`, `QuotationDetailContent.tsx` (2)
- Clients — `ClientDetailContent.tsx` (2)
- Dashboards / widgets — `StaffDashboard.tsx`, `BusinessOwnerDashboard.tsx`,
  `UpcomingAppointmentsWidget.tsx`, `StaffScheduleTable.tsx`
- Inventory — `ProductForm.tsx` (2), `IntegrationsPage.tsx`,
  `TenantManagementTable.tsx`

### Shape of the fix

Mirror what was built for money: one `formatDate` / `formatDateTime` utility
plus a `useDateFormat()` hook reading `tenantTimezone` / `tenantDateFormat` from
the auth store (the transport already exists — `/auth/me` carries
`tenantCurrency` and `tenantLocale` today; adding two more strings is trivial).
Then enable the two controls.

**Timezone is the harder half and should not be underestimated.** Currency only
changed how a number was *displayed*; timezone changes which *day* an
appointment appears on. Anything that groups or filters by date — the calendar's
day/week cells, `isSameDayLocal` in `dateUtils`, "upcoming" appointment queries —
has to agree on the tenant's zone rather than the browser's, or the calendar and
the list will disagree about the same appointment. That reaches into backend
queries, not just rendering.

---

## TD-013 — RESOLVED (batch pass): fabricated metrics now disclosed, not asserted

**Status:** 🔴 **PRIORITY — same tier as TD-022.** The two are equally serious in
different dimensions: TD-022 *breaks a workflow*; this one *fabricates the
operational trust signals a Super Admin uses to judge platform health*, on the
one console built specifically for that judgement.

### The fix is smaller than it looks — the correct pattern is already on the page

Do **not** start by building real observability. The `SuperAdminDashboard`
already carries an honest `Coming in Phase 5` badge on **two other panels of the
same page**. The telemetry panels simply never got it.

That inconsistency is the important detail: the placeholder-disclosure pattern
was known, implemented, and sitting one panel away. Its absence on the latency
and throughput figures is a gap in *what was flagged*, not in what the team knew
how to do.

**So the first, obviously-correct fix is: apply the existing `Coming in Phase 5`
treatment to the telemetry panels too.** That is a few lines, needs no new
infrastructure, and immediately stops the console from asserting numbers it does
not have. Wiring real metrics is a separate, larger piece of work that can follow
on its own schedule.

The same reasoning applies to `StaffDashboard`'s "My Stats": disclose first, wire
up second.

**Revised during Group 3 Stage 3 batch 6.** The original entry named a single
hard-coded `$12.4k`. Reading every rendered string showed that was one figure out
of nine, across two dashboards.

`frontend/src/pages/dashboard/StaffDashboard.tsx:136`:

```tsx
<span className={styles.statValue}>$12.4k</span>
```

A literal, presented in a stat tile alongside figures that *are* real. This is
not a formatting bug — the money-formatting pass deliberately left it alone,
because applying a currency formatter to a fabricated number would only make the
fabrication look more credible.

**The concern is that a user reads this as their own sales figure.** Fake data
in a demo page is one thing; fake data in the authenticated dashboard of a live
CRM is a number someone might act on.

Options, in order of preference: wire it to a real metric (the dashboard use
cases already compute related figures); or remove the tile; or, if it must stay
pending a real metric, label it unmistakably as sample data. Leaving it
unlabelled is the only option that should be ruled out.

Worth a sweep for siblings while in there — this was found incidentally, and
nothing rules out other hard-coded figures in the dashboard tiles.

### The sweep was warranted: eight more fabricated figures

**`StaffDashboard.tsx` — the entire "My Stats" panel, not one number.**

| Label | Value | Trend |
|---|---|---|
| REVENUE | `$12.4k` | `+8%` |
| CLOSED | `18` | `Target 20` |
| WIN RATE | `64%` | `-2%` |

Six fabricated values and three invented trend directions, rendered with real
trend iconography (`TrendingUp`, `TrendingDown`, `CheckCircle2`) that makes them
read as computed. A sales rep looking at this sees their revenue, their close
count, and their win rate. None of it is theirs.

**`SuperAdminDashboard.tsx` — fake platform telemetry.**

| Label | Value |
|---|---|
| Global Latency | `24ms` |
| Active Requests | `14.2k/s` |
| Real-time Traffic | (chart with no data source) |

Presented as live operational metrics on a Super Admin console. Two *other*
panels on the same page carry an honest `Coming in Phase 5` badge — which makes
the unlabelled latency figures worse by contrast: the page demonstrates it knows
how to disclose a placeholder, and does not do so here.

### Extraction treatment (Group 3 Stage 3)

Labels were extracted; **every fabricated value was left exactly as found and
untranslated.** `Target 20` was left whole rather than split into
`Target {{value}}`, because interpolating an invented number through the
translation catalogue would make it look like a computed figure.

This keeps all nine visible to `jsx-no-literals`, which is the intended signal —
see the sequencing note under TD-020.

---

## TD-014 — Onboarding Step 2's upload box is decorative

`frontend/src/pages/onboarding/OnboardingPage.tsx` — the "Click to upload / drag
and drop" area is a styled `<div>`. There is no `<input type="file">`, no click
handler, and no upload call. Clicking it does nothing at all.

Found while removing Step 3 (the localization step, whose region select fed a
parameter registration silently discarded and whose language select was never
wired to state). Onboarding is now a **2-step** flow — and the second of those
two steps is this one, which does not work. That is a materially worse ratio
than when the defect was hidden among three steps.

`ImagePicker` already does exactly this job on the Company Settings page,
including cropping and upload, so the fix is likely to be reuse rather than new
code. The wrinkle is ordering: onboarding uploads branding *before* a tenant
exists to attach it to, so either the tenant is created first and branding
attached after, or the image is held client-side until registration completes.

Alternatively, drop the step. A 1-step registration that works is better than a
2-step one that half does.

---

## TD-015 — RESOLVED: Company Settings called an endpoint that did not exist

`useTenantSettings` requested `/${tenantSlug}/settings/tenant`, but the router is
mounted at `/api/:tenantSlug/settings` with `get('/')` and `put('/')`. The
trailing `/tenant` matched no route, so **every load and save from the Company
Settings page 404'd** — including the quotation-approval toggle, the one section
the SRS audit described as "actually wired".

It went unnoticed because the integration tests call the correct path
(`/api/${tenantSlug}/settings`) and passed throughout, so the backend was proven
healthy while the only frontend caller was pointed somewhere else entirely.

Fixed in Group 3 Item 1: the hook now derives one `endpoint` constant used by
both `fetchSettings` and `updateSettings`, so the two cannot drift apart again.

**Worth noting as a pattern, not just a typo:** integration tests that exercise
the API directly cannot catch a frontend calling the wrong URL. Nothing in
either suite tested that the two agree.

---

## TD-016 — Server error messages stay English while the UI ships in Albanian

**Deliberate MVP limitation, decided explicitly — not an oversight.**

Group 3 Item 2 ships an English + Albanian interface. **Every error message
originating on the server remains English**, in both languages.

### What an Albanian-reading user actually sees

A wholly Albanian interface, into which English sentences appear at exactly the
moments things go wrong — failed validation, permission denials, rate limiting,
upload rejections:

```
error: 'Only business owners can change workspace branding.'
error: 'This account has been deactivated.'
error: 'Too many attempts. Please try again later.'
error: 'Unsupported format. Use a JPEG, PNG, WebP, GIF or AVIF image.'
error: 'Cross-tenant access forbidden'
```

Anyone shipping or demoing the Albanian build needs to know this is expected.

### Scale

| Source | Count |
|---|---|
| Domain error messages (`DomainError` subclasses) | 15 |
| Distinct API `{ error: '...' }` strings | 16 |
| `throw new Error('...')` with human prose | ~100 |
| **Server-side total** | **~131** |
| Frontend sites rendering a server message directly | **48** |

The 48 are the call sites using `extractApiErrorMessage`, `data.error`, or
`err.message` — every one displays server prose verbatim.

Zod validation failures are in the same position: `validateRequest` returns the
raw `ZodError`, whose messages are English and generated by Zod itself.

### Why it was deferred

Translating these properly is **not** a matter of running the strings through a
catalogue. The API must stop returning prose and start returning **error codes**:

```ts
// today
res.status(403).json({ error: 'Only business owners can change workspace branding.' });
// required
res.status(403).json({ code: 'BRANDING_OWNER_ONLY' });
```

...with the frontend owning every wording. That is an API contract change
touching every error path in the backend plus all 48 frontend call sites, and it
is comfortably larger than the entire frontend string extraction it would
accompany. Folding it in would have doubled an already large item.

### Shape of the fix, when taken up

1. Give `DomainError` a `code` field; assign a stable SCREAMING_SNAKE code per
   subclass. The class hierarchy already exists, so this is mechanical.
2. Return `{ code, error }` during a transition — `error` keeps existing clients
   working while `code` is adopted.
3. Add an `errors` namespace to the catalogues, keyed by code. (Item 2
   deliberately created **no** such namespace, so its absence is a signal rather
   than an omission.)
4. Move the 48 frontend call sites onto code lookup, falling back to `error`
   prose for any code not yet mapped.
5. Zod messages need their own decision: either a per-field message map on the
   frontend keyed by `issue.path` + `issue.code`, or `zod-i18n`.

Worth pairing with **TD-011**, since both touch `validateRequest` and the error
response shape.

---

## TD-017 — 14 database test suites rely on Jest's 5s default hook timeout

**Observed once, not reproduced — logged so a future red run is not mistaken for
a regression.**

During Group 3 Item 2 Stage 1 verification, one backend parallel run failed:

```
Test Suites: 1 failed, 105 passed, 106 total
Tests:       13 failed, 582 passed, 595 total
    at Object.<anonymous> (src/inventory/inventory.test.ts:7:1)
```

All 13 of that suite's tests failed together, attributed to module scope (line 7
is the `describe`), which is how Jest reports a `beforeAll` failure.

### Honest status of the diagnosis

**Unconfirmed.** The error text was not captured before it scrolled, and the
failure did not recur in **five** subsequent runs — three normal, plus two
deliberate stress runs at `--maxWorkers=16` and `--maxWorkers=24`. The suite
passes in isolation in ~3.9s.

### The hypothesis, and the evidence for it

`src/inventory/inventory.test.ts` has a `beforeAll` that calls `createApp()` and
two `prisma.createMany` calls with **no explicit timeout**, so it runs against
Jest's 5-second default. Under eight workers contending for Postgres, that is
plausibly exceeded. Consistent with: whole-suite failure, hook-scope attribution,
intermittency, and passing solo.

Against it: two stress runs failed to reproduce.

### New evidence (Group 3 Stage 4) — the hypothesis is now better supported

It happened a second time, in a different suite
(`src/quotations/interfaces/http/Quotations.integration.test.ts`), with the same
signature: the whole suite failing at module scope, then three consecutive clean
runs afterwards.

**The useful new datum is the wall-clock time.** The failing run took **52.2s**;
the three passing runs that followed took **33.3s, 28.5s and 27.4s**. The failure
coincided with the suite running roughly 60-90% slower than baseline — exactly
what the 5-second default hook timeout would produce under contention, and not
what a data collision or fixture clash would produce.

That is still circumstantial, but it is the first measurement that
*discriminates* between the timeout hypothesis and the alternatives. Two
occurrences, in two different suites, both correlated with a slow run.

Recommendation is unchanged and now firmer: set `testTimeout: 30000` in
`jest.config.ts`. Worth doing before the next long verification session, since
a spurious red run costs more to diagnose than the fix costs to apply.

### What is definitely true regardless

**14 DB-touching suites have `beforeAll` hooks with no explicit timeout:**

```
src/inventory/inventory.test.ts
src/quotations/interfaces/http/Quotations.integration.test.ts
tests/integration/appointments/appointmentRoutes.test.ts
tests/integration/appointments/PrismaAppointmentRepository.test.ts
tests/integration/clients/clientRoutes.test.ts
tests/integration/clients/PrismaClientRepository.test.ts
tests/integration/clients/PrismaInteractionRepository.test.ts
tests/integration/dashboard/dashboardRoutes.test.ts
tests/integration/inventory/inventoryE2E.test.ts
tests/integration/inventory/inventoryRoutes.test.ts
tests/integration/quotations/quotationE2E.test.ts
tests/integration/reports/reportRoutes.test.ts
tests/integration/tenant/PrismaTenantRepository.test.ts
tests/integration/tenant/tenantRoutes.test.ts
```

The suites written during this project (`staffDeactivation.test.ts`,
`tenantSettings.test.ts`) pass `60000` explicitly; these predate that habit.
`jest.config.ts` sets no global `testTimeout`, so all 14 use the 5s default for
work that is inherently I/O-bound and contended.

### Options

1. **`testTimeout: 30000` in `jest.config.ts`** — one line, covers all 14 and
   anything added later. Downside: raises the ceiling for genuinely hung tests
   too, so a real deadlock takes 30s to surface instead of 5.
2. **Explicit timeouts on the 14 hooks** — targeted, leaves per-test timeouts at
   5s, but is 14 edits and a habit that must be remembered.

Option 1 is probably right — hook setup and per-test assertions want different
ceilings, and Jest's `testTimeout` applies to both, so a middle value like 30s
is a reasonable compromise for an I/O-bound suite.

**Not fixed during Item 2:** it spans 14 files or a global config change
affecting all 106 suites, and it is unrelated to i18n. It also should not be
"fixed" on an unconfirmed diagnosis — if the real cause is something else, a
raised timeout would hide it rather than solve it. Worth pairing with **TD-001**,
which covers the neighbouring fixture-isolation problems in the same suites.

---

## TD-018 — RESOLVED (batch pass): lint rules promoted to error and gated in CI

**Investigated before logging, and the answer is better than expected: no manual
sweep is needed.**

### The recurrence that prompted this

Three separate real bugs in this project from dependency arrays that did not
cover what the hook body referenced:

| # | Where | Effect |
|---|---|---|
| 1 | Appointments fetch | fetch-loop risk |
| 2 | `useNavigation` | shared-array mutation across roles |
| 3 | `InventoryList.tsx:209` (Group 3 Item 2 Stage 1) | KPI tile kept the old currency symbol after a currency change, because `formatMoney` was missing from `[summary]` |

### What was actually checked

The question was whether oxlint — which is what `npm run lint` runs; **there is no
ESLint in this project at all** — has an equivalent to
`react-hooks/exhaustive-deps`.

**It does, and it is already enabled**, inherited by default from the `react`
plugin declared in `.oxlintrc.json`. It is not listed explicitly in the `rules`
block, which is why it was easy to assume it was absent.

It demonstrably works: recurrence #3 above was found *by oxlint*, not by reading
code —

```
src/pages/inventory/InventoryList/InventoryList.tsx:209:16:
  warning react-hooks(exhaustive-deps): React Hook useMemo has a missing
  dependency: 'formatMoney'
```

**So the gap is not detection. It is severity and enforcement:** the rule emits
`warning`, warnings do not fail anything, and `npm run lint` does not gate CI.
Every one of these three bugs was almost certainly visible in lint output at the
time it was introduced, and was scrolled past.

### Current violation count: 2

A full audit of the frontend finds only **two** outstanding:

```
src/components/inventory/StockAdjustmentPanel/StockAdjustmentPanel.tsx:54
  useEffect missing: 'adjustWarehouseId', 'transferOriginId'
src/pages/quotations/QuotationDetailContent.tsx:36
  useEffect missing: 'loadData'
```

That is a small, finite list — not the systematic audit this was expected to be.

### The fix, in order

1. **Promote to error** in `.oxlintrc.json`:
   `"react-hooks/exhaustive-deps": "error"`.
2. **Gate CI on `npm run lint`.** Without this, step 1 changes nothing — an error
   nobody runs is a warning.
3. **Fix the two violations — carefully, not mechanically.**
   `QuotationDetailContent`'s missing `loadData` is the classic trap: adding it
   naively to the array creates an infinite fetch loop, because `loadData` is
   redefined every render. The correct repair is `useCallback` on `loadData`
   first, *then* the dependency. This is exactly why it is logged rather than
   fixed in passing.
4. **Resolve the one pre-existing `rules-of-hooks` error first**, or CI cannot go
   green: `src/hooks/useNavigation.test.ts:10` — a false positive, where
   `renderHook(() => useNavigation(...))` is flagged because the arrow function
   is anonymous. Needs a targeted disable comment with a note, not a rule
   downgrade.

Steps 1–2 are the leverage. They convert this entire bug class from "found by a
human during review, three times" to "found at authoring time, free, forever."

### AGREED FOLLOW-THROUGH (scheduled, not an open question)

This is no longer an investigation note. The decision is made and the work is
scheduled for **the pass immediately after Group 3 Stage 3**, once the codebase
is otherwise clean:

1. **Gate CI on `npm run lint`** as a blocking step. This is the whole fix — an
   error nobody runs is a warning.
2. **Promote `react-hooks/exhaustive-deps` from warning to error** in
   `.oxlintrc.json`. Justified empirically, not on principle: it has now caught
   **three real bugs** in this project.
3. **Fix `QuotationDetailContent.tsx:36` properly** — wrap `loadData` in
   `useCallback` with its correct dependencies *first*, then add it to the
   effect's array. Adding it directly recreates exactly the infinite-fetch risk
   guarded against everywhere else in this codebase. It gets the same
   rerender-proof test pattern required of every other data-fetching hook.
4. **Fix `StockAdjustmentPanel.tsx:54`** (missing `adjustWarehouseId`,
   `transferOriginId`).
5. **Fix the `useNavigation.test.ts:10` false positive** — a blocker for CI
   going green, since it is reported at error level. Needs a targeted disable
   with a comment explaining that `renderHook(() => useNavigation(...))` is a
   legitimate anonymous-arrow call, not a rule downgrade.

---

## TD-019 — Albanian catalogue needs a native speaker's review before it can be called production-ready

**Status: structurally complete ≠ linguistically vetted. Do not present Albanian
as a fully supported language until this is closed.**

Group 3 Item 2 ships the interface in English and Albanian. The i18n machinery —
keys, namespaces, interpolation, plural rules, fallback — is correct and tested.
**The Albanian wording is not vetted.**

### Scope

| Set | Count | Confidence |
|---|---|---|
| `common.json` — UI chrome and actions (`Ruaj`, `Anulo`, `Fshi`, `Kërko`, `Duke u ngarkuar…`) | ~40 | Reasonable |
| Everything else — all 7 remaining namespaces | **~550** | **Unreviewed** |

The risk concentrates in **domain vocabulary**, not chrome. Terms like
*quotation*, *stock level*, *warehouse*, *lead*, *outcome category*,
*business owner* have established renderings in Albanian commercial usage that a
non-speaker cannot reliably produce. A plausible-looking wrong term is worse than
an obviously missing one, because nobody flags it.

### How unreviewed strings are marked

Every Albanian string outside the reviewed set is tracked in a machine-detectable
manifest rather than a comment, so "is this reviewed?" is a check, not a memory:

- `frontend/src/locales/sq/.reviewed.json` — an allowlist of reviewed key paths.
- `frontend/scripts/check-translations.mjs` — enumerates every key in the `sq`
  catalogues, subtracts the allowlist, and reports the remainder. Exits non-zero
  under `--strict`.

**A `--strict` run must pass before Albanian is described as production-ready.**
It is deliberately *not* wired into CI as a blocking step yet, because it would
fail by design until the review happens; it is a release gate, not a build gate.

### User-facing honesty in the meantime

The Language setting does not present Albanian as an equal-footing option. It
carries a visible indicator that the translation is pending review, so a user
choosing it is not misled into thinking it has been vetted — the same principle
applied to every "Coming soon" placeholder in this project.

### Closing this item

1. A native Albanian speaker reviews the ~550 strings, ideally with the app in
   front of them (Storybook's language toolbar renders any component in Albanian
   without a running backend).
2. Corrections land in `src/locales/sq/*.json`.
3. Reviewed key paths are added to `.reviewed.json`.
4. `node scripts/check-translations.mjs --strict` passes.
5. The pending-review indicator is removed from the Language setting.

Note that **TD-016 remains open independently**: even with a perfect Albanian
catalogue, server error messages stay English. Both must close before the
Albanian experience is genuinely complete.

---

## TD-020 — RESOLVED (batch pass): placeholder UI swept — removed or disclosed

Found during Group 3 Stage 3 extraction. Neither is a translation problem;
both are UI that occupies space while conveying no information.

**1. `ClientListContent` — the "Recent Activity" column.**
`render: () => <span>-</span>`. Every row, always. The column has a header, a
width, and a permanent dash — it has never been wired to any data source. A user
scanning the client directory sees a column that looks like it should tell them
something.

**2. `ClientDetailContent` — the "Filter" and "Search" timeline buttons.**
Both are `disabled` with `title="…coming soon"`. Honest, at least, but they have
sat in the header of the interactions panel unimplemented.

Related, already logged separately: **TD-013** (`StaffDashboard`'s hard-coded
`$12.4k`), **TD-014** (onboarding's decorative upload box). This is the same
family — placeholder UI that survived into a product being audited for SRS
compliance.

Worth one deliberate sweep rather than four separate fixes: find every element
that is permanently disabled, permanently empty, or renders a constant, and
decide per item whether to wire it up, remove it, or label it unmistakably. The
current state — a mix of silent placeholders and "coming soon" labels — is
inconsistent about which is which.

### TD-020 addendum — the CategoryList instance is the priority one

`CategoryList.tsx` carries the literal comment `{/* Secondary Widgets - ALL MOCK
DATA */}` above two widgets:

- **"Hierarchy Health"** — hard-coded `14` root categories, `82` sub-categories,
  and fixed 65%/88% progress bars.
- **"QUICK AUDIT"** — hard-coded **"3 Unused Categories"**, rendered directly
  above a **"Run System Cleanup" button that really works** and archives real
  categories.

This is the same root problem as TD-013 (`$12.4k`) but with sharper teeth: a
fabricated number with no side effect is misleading; **a fabricated number that a
real, consequential button acts on is a live footgun**. A user reads "3 unused
categories", presses the button, and gets a real archive operation over an
unrelated real count.

**When TD-020 is picked up, do this instance first.**

### Sequencing dependency: TD-020 blocks the TD-018 lint gate

`react/jsx-no-literals` cannot be promoted to `error` (TD-018 step 2) until the
mock-data sweep lands. The rule correctly refuses to ignore the hard-coded `14`,
`82` and `3` in CategoryList, and the `$12.4k` in StaffDashboard — they are, in
fact, hard-coded strings in JSX.

**Do NOT resolve this by adding them to the rule's `allowedStrings`.** The order
of operations is: fix the fabricated data first, then let the linter enforce
honesty going forward — not teach the linter to tolerate the lie. Allowlisting
would permanently encode "this fake data is fine" into the config, which is the
opposite of the intent.

Correct order:
1. TD-020 / TD-013 mock-data sweep (wire up, remove, or unmistakably label).
2. TD-018 step 2: promote `jsx-no-literals` and `exhaustive-deps` to `error`.
3. TD-018 step 1: gate CI on `npm run lint`.

---

## TD-021 — RESOLVED (batch pass): identifiers now resolved to names (21 sites, not 3)

**Same root cause as the fix already made in Group 2 Item 1.** Whoever picks this
up should reuse `getStaffDisplayName` / `findPersonById` (`frontend/src/utils/userUtils.ts`)
rather than reinventing the pattern — those helpers exist precisely because the
client list and detail pages had this exact bug with `assignedUserId`.

### The three sites, worst first

**1. `QuotationDetailContent.tsx` — status history. THE WORST OF THE THREE.**

```tsx
<span>By User: {event.changedByUserId.substring(0, 8)}</span>
```

This one **reads as broken, not merely unpolished.** "By User:" sets the
expectation of a person's name, and what follows is eight hex characters. Unlike
a quotation reference, a truncated UUID after "By User:" does not resemble any
intentional identifier format — a user seeing `By User: 3f2a9c1b` will reasonably
conclude the page failed to load something.

Fix: resolve `changedByUserId` against the staff list, exactly as
`ClientDetailContent` now does for `assignedUserId`. Fall back to the id only
when the user cannot be found (e.g. a deactivated member no longer returned by
the staff endpoint — worth checking, given `GetTenantStaffUseCase` filtering).

**2 & 3. `QuotationDetailContent.tsx` + `QuotationListContent.tsx` — quotation reference.**

```tsx
<h1>Quotation {quotation.id.split('-')[0].toUpperCase()}</h1>
<span>{quotation.id.split('-')[0].toUpperCase()}</span>   // list rows
```

Milder: `3F2A9C1B` at least *looks* like a deliberate reference code, and it is
stable and clickable. But it is still a database id leaking into the interface,
it is not guaranteed unique when truncated to 8 characters, and it gives users
nothing they can quote back to a colleague meaningfully.

Fix properly means a real human-facing quotation number — a per-tenant sequence
(`QUO-2026-0042`) persisted on the row. That is a schema change plus a
backfill, so it is a larger piece of work than site 1 and should be scoped
separately. **Site 1 can and should be fixed on its own first.**

**Sites 2 and 3 done in M2 Slice 9 (2026-10-03).** Quotations and offers carry
a per-tenant yearly number (`OF-2026-0001`, `Quotation.number` + `version`,
from `DocumentSequence`). The reference migration numbered every existing row,
and the API returns `reference`. `quotationReference({ number, version })` is
the one formatter, used by every notification, the company history, the
public view and the PDF. The list and detail pages show `reference` and no
longer slice the id.

### Why this is logged rather than fixed

Group 3 Stage 3 is a string-extraction pass. Resolving an id to a name is a
behaviour change requiring a data lookup, a loading state, and a fallback policy
— none of which belong in a pass whose contract is "same behaviour, translatable
text". The surrounding labels were extracted (`detail.byUser` interpolates
`{{user}}`), so the fix is a one-line change at the call site once the lookup
exists.

### Context: this is the dominant defect class found by the full-pass extraction

Across four batches, "render the raw stored value instead of resolving it" has
appeared **8 times**:

- 5 raw **enum** leaks — client status, appointment status, product status,
  quotation status ×2 (fixed during Stage 2's enum consolidation and Stage 3
  batches 1–2, since a key map was the natural home for them)
- 3 raw **identifier** leaks — this item

It is more common than the fake-data placeholders (TD-013/TD-020) and would not
have been found by an incremental extraction: it surfaced only because every
rendered string in the application had to be read.

### Addendum to TD-020 — another permanent placeholder

`QuotationDetailContent.tsx` renders a **Download PDF** button unconditionally,
whose only action is `alert('PDF generation coming soon')`. Its own comment says
`{/* Always show Download PDF as a placeholder */}`. Same family as the Recent
Activity column and the timeline Filter/Search buttons — include it in the TD-020
sweep.

### Addendum to TD-020 — the tenant table's Status column is back (2026-07-28)

`TenantManagementTable` dropped its "Plan" and "Status" columns under this item
because the Tenant model tracked neither, so both rendered the not-set dash on
every row. That removal carried its own precondition for reversal: *"reinstate
alongside the billing/subscription fields they would read from."*

**Status is reinstated**, reading the new `Tenant.subscriptionStatus`, and the
column now carries a real per-row value on every row — plus the suspend and
reactivate actions that make it actionable rather than merely informative.

**Plan is NOT reinstated and this item stays open for it.** Billing is still
unmodelled; a Plan column today would be exactly the permanently empty one that
was removed. `TenantManagementTable.test.tsx` asserts its continued absence, so
it cannot come back by accident alongside the column that earned its place.

---

## TD-022 — RESOLVED (batch pass): appointment assignment now uses the real staff list

**Status:** 🔴 **PRIORITY — same tier as the Group 1 Staff-dashboard data-scoping
bug, and arguably more severe.** That one leaked information across roles; this
one is an outright broken core workflow. Assigning an appointment to anyone other
than yourself **fails right now, for every real user**.

**Fix together with TD-021.** They share the identical fix — `useTeam().staff` +
`getStaffDisplayName` — and touching either file without the other means doing
the same work twice.

### Original entry: AppointmentForm's "Assigned Staff" dropdown offers three people who do not exist

**This is the most serious placeholder found in the project.** Logged separately
from TD-020 rather than inside it, because the others *mislead* — this one
*breaks*. A user who picks one of these options cannot create their appointment
at all.

### The defect

`frontend/src/components/forms/AppointmentForm/AppointmentForm.tsx`:

```tsx
<SelectInput label="Assigned Staff" {...register('assignedUserId')}>
  {user && <option value={user.userId}>Myself</option>}
  <option value="1">Marcus Thorne (Lead Architect)</option>
  <option value="2">Elena Vance (Senior Consultant)</option>
  <option value="3">Riley Matthews (Account Manager)</option>
</SelectInput>
```

Three invented people with hard-coded ids `"1"`, `"2"`, `"3"`. The select is
bound via `register('assignedUserId')`, and `submitForm` sends it verbatim:

```tsx
await createAppointment({
  clientId: lockedClientId || values.clientId,
  assignedUserId: values.assignedUserId,   // <-- "1", "2" or "3"
  scheduledAt,
  notes: values.notes,
});
```

`Appointment.assignedUserId` is **`String` (non-nullable) with a real foreign key
to `User`**. So the value cannot resolve, Postgres rejects the insert on the FK
constraint, and the user gets a failed save with whatever generic error the
`ClientController`-style handlers produce.

**Net effect in production today:** of the four options in this dropdown, only
"Myself" works. The other three are guaranteed failures, and nothing in the UI
warns of it.

### Why it was not fixed during extraction

Group 3 Stage 3 is a string-extraction pass. Fixing this means fetching the real
staff list (`useTeam().staff`, already used by `ClientFormContent` and
`ClientDetailContent` for exactly this purpose) and rendering real options — a
behaviour and data-fetching change, not a text change.

**The three fake names were also deliberately NOT extracted into the
catalogue.** Translating invented people's names into Albanian would launder the
fabrication into something that looks maintained and intentional. They are left
exactly as found so they remain conspicuous.

### The fix

Replace the hard-coded options with the real staff list, mirroring
`ClientFormContent.tsx`:

```tsx
const { staff, fetchStaff } = useTeam();
...
<SelectInput label={t('form.assignedStaff')} {...register('assignedUserId')}>
  {user && <option value={user.userId}>{t('form.myself')}</option>}
  {staff.filter((m) => m.id !== user?.userId).map((m) => (
    <option key={m.id} value={m.id}>{getStaffDisplayName(m)}</option>
  ))}
</SelectInput>
```

This is the same `useTeam` + `getStaffDisplayName` pattern as TD-021's fix, so
the two are worth doing together.

### Two smaller defects in the same file

**1. The "Appointment Type" select is bound to nothing.**

```tsx
<SelectInput label="Appointment Type">
  <option value="initial">Initial Consultation</option>
  <option value="review">Quarterly Review</option>
  <option value="support">Technical Integration Support</option>
  <option value="strategy">Strategic Planning Session</option>
</SelectInput>
```

No `register(...)`, no `value`, no `onChange`. The user's selection is discarded
on submit and there is no `type` field on the Appointment entity to hold it.
Purely decorative — TD-020 family. Its four options were likewise left
untranslated.

**2. The "High Priority" toggle is documented as non-functional** in an existing
comment ("There is NO corresponding `priority` field on the backend Appointment
entity... is NOT submitted or persisted"). Honest, at least, but it is a control
that appears to do something and does not. Its labels *were* extracted, since the
text itself is real and the comment already discloses the state.

### Related

TD-020 (placeholder UI family), TD-021 (raw values rendered instead of resolved —
shares the `useTeam`/`getStaffDisplayName` fix), TD-013 (fabricated `$12.4k`).

---

## TD-023 — RESOLVED (batch pass): one shared password-helper key, matching the enforced rule

Small, cheap, and user-facing. Surfaced during Group 3 Stage 3 batch 7, because
extraction put both strings adjacent in one catalogue file for the first time.

| Screen | On-screen helper text |
|---|---|
| `ResetPasswordPage.tsx` | "Must be at least **12 characters** with a mix of letters, numbers & symbols." |
| `StaffInvitationPage.tsx` | "Min **8 chars**, 1 uppercase, 1 lowercase, 1 digit." |
| `OnboardingPage.tsx` | "Min **8 chars**, 1 uppercase, 1 lowercase, 1 digit." |

**The backend enforces 8**, in `authSchemas.ts` — the same rule for all three
flows:

```ts
z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/)
```

So the reset-password screen states a requirement that does not exist. Two ways
a user is misled: they labour to construct a 12-character password that was never
needed, or they notice a 9-character password is accepted and reasonably conclude
the validation is broken.

The "mix of ... symbols" clause is wrong too — no symbol is required by the
regex chain.

### Fix

Make `ResetPasswordPage`'s helper match the other two and the actual rule —
"Min 8 chars, 1 uppercase, 1 lowercase, 1 digit." Correct **both** language
catalogues (`auth.resetPassword.helper` in `en` and `sq`); the Albanian string
was translated faithfully from the wrong English, so it is wrong in the same way.

Better still: have all three screens reference a single shared key, so the copy
cannot drift from the rule again. `auth.staffInvitation.helper` already carries
the correct wording and is used by two of the three.

**If the intent is actually to require 12 characters**, then the backend schema
is what should change — but that is a security-policy decision, not a copy fix,
and it would need to account for existing accounts with shorter passwords.

---

## TD-024 — RESOLVED (batch pass): scaffold deleted, plus three dead codemod scripts

`frontend/src/stories/` contains Storybook's generated getting-started files:
`Page.tsx`, `Header.tsx`, `Button.tsx`, their `.stories.ts` siblings,
`Configure.mdx`, `page.css`, `header.css`, `button.css`, and an `assets/`
folder.

None of it is referenced by application code — `Page.tsx` imports only its
sibling `Header.tsx`. The project has its own `Button` (`components/ui/Button`)
with its own story, so the scaffold `Button` is a second, unrelated component of
the same name sitting in the source tree.

It surfaced during Group 3 Stage 3: **16 of the residual `jsx-no-literals`
findings come from this directory**, i.e. roughly a third of what looks like
"unextracted strings" is demo content that will never be shown to a user.

Same family as `src/replace.cjs` (deleted in Stage 2): dead scaffolding that a
future reader has to investigate before concluding it is irrelevant. Deleting it
also removes a duplicate `Button` from search results.

**Not deleted during the extraction pass** — removing files is outside a pass
whose contract is "same behaviour, translatable text", and the Storybook config
may glob `src/**/*.stories.*` in a way worth checking first.

---

## Group 3 Stage 3 — residual literal inventory (closing state)

Extraction is complete. **30 `jsx-no-literals` findings remain in application
code** (46 including the TD-024 scaffold). None is an unextracted user-facing
string. Full accounting, so nobody has to re-derive it:

| Category | Count | Why it remains |
|---|---|---|
| Fabricated data — `StaffDashboard` stats | 6 | TD-013. Deliberately untranslated so it stays conspicuous |
| Fabricated data — `StaffDashboard` "Today, Oct 24" | 1 | TD-013 |
| Fabricated data — `CategoryList` widgets (`14`, `82`, `3`) | 3 | TD-013 / TD-020 |
| Fabricated telemetry — `SuperAdminDashboard` (`24ms`, `14.2k/s`) | 2 | TD-013 |
| Fabricated people — `AppointmentForm` staff options | 3 | **TD-022** |
| Dead select options — `AppointmentForm` appointment types | 4 | TD-020 |
| Honest placeholders — "Coming in Phase 5" ×2 | 2 | Correct as-is; disclosure, not fake data |
| Punctuation / separators (`/`, `—`, `neva.crm/`) | ~4 | Not translatable text |
| oxlint false positives (`} catch (e) {`, `loadData();`) | ~5 | Rule mis-locates these; not strings |

**The important consequence:** every remaining item is either deliberate, a
tracked defect, or a false positive. When the TD-013/TD-020/TD-022 fixes land,
this count should fall to roughly the punctuation and false-positive rows —
which is the state in which `jsx-no-literals` can be promoted to `error`
(TD-018), configuring `allowedStrings` only for genuine punctuation.

---

## TD-025 — RESOLVED (Group 3 Stage 4): dashboard and calendar disagreed about what day it is

**Was a LIVE production defect**, not a risk introduced by the timezone feature.
Recorded at priority tier alongside TD-013 and TD-022 because it silently
corrupted a visible number.

### The defect

Three independent definitions of "day" were in use simultaneously:

| # | Site | Resolved in | Fed |
|---|---|---|---|
| 1 | `GetTenantClientMetricsUseCase.dayBounds` — `new Date(); setHours(0,0,0,0)` | **server host** timezone | Dashboard KPI "Appointments Today" + its yesterday trend |
| 2 | `isSameDayLocal` (`utils/dateUtils.ts`) | **browser** timezone | Calendar Queue, mobile agenda |
| 3 | `CalendarContent` inline filter (a hand-copied duplicate of #2) | **browser** timezone | Which calendar cell an appointment renders in |

#2 and #3 agreed with each other. Neither agreed with #1.

`TZ` is unset on the backend, so it inherits the host zone. Measured on the
development host (`Africa/Addis_Ababa`, UTC+3) against an Albanian user
(`Europe/Tirane`, UTC+2):

```
appointment instant             : 2026-07-27T21:30:00.000Z
server day  (Africa/Addis_Ababa): 2026-07-28
browser day (Europe/Tirane)     : 2026-07-27
same calendar day?              : false
```

For a one-hour window every day, the dashboard said "Appointments Today: 1"
while the calendar drew that appointment on a different date. The window is as
wide as the offset between the deploy host and the user — a US-hosted deploy
serving European users would disagree for 8–10 hours a day.

### ⚠️ VISIBLE BEHAVIOUR CHANGE — the KPI number moves

**"Appointments Today" will report a different figure for any tenant whose
configured timezone differs from the server host's.** This is the fix working,
not a regression, but it is a number on a dashboard changing without the
underlying data changing, so it should be expected rather than investigated.

Anyone reconciling a previously-screenshotted count against the new one should
know the old figure was computed in the server's zone.

### The fix

One definition, resolved in `tenant.timezone`, used by all three sites:

- `backend/src/shared/domain/time/tenantDay.ts` — `dayKeyInZone`,
  `isSameDayInZone`, `dayBoundsInZone`
- `frontend/src/utils/tenantDay.ts` — `dayKeyInZone`, `isSameDayInZone`

**The two files are duplicates and cannot be merged.** Backend and frontend are
separate packages with no shared module path (no workspace root;
`backend/tsconfig.json` includes only `src/**`). They are kept in sync by an
**identical fixture table asserted in both suites**:

- `backend/tests/unit/shared/tenantDay.test.ts`
- `frontend/src/utils/tenantDay.test.ts`

Change one implementation without the other and its suite fails. The table
covers the original UTC+3/UTC+2 case, zones behind UTC, both DST transitions, a
half-hour zone (UTC+5:45), and exact-midnight ownership.

`backend/tests/integration/dashboard/tenantTimezoneDayBounds.test.ts` pins the
cross-surface guarantee from the API side, including the decisive case: two
tenants, the same instant, different configured zones, different counts.

**A note on how those tests were written.** The first two attempts hard-coded
UTC hours and passed or failed depending on what time of day the suite ran —
the tests were wrong, not the fix. They now derive every instant from
`dayBoundsInZone`, and the decisive case *searches* for an instant that splits
the two zones rather than assuming one, because whether 23:59Z is "tomorrow" in
Tokyo depends on whether Tokyo has itself rolled over.

### What was deliberately left alone

- **`findUpcoming` and friends** (`scheduledAt: { gt: new Date() }`) — instant
  comparisons. "Is it in the future" has one answer in every zone. Correct
  as-is; changing them would have been a regression.
- **Reports' monthly bucketing** — stays UTC, now documented at the site. See
  the comment in `PrismaReportRepository`: a financial period boundary must not
  move retroactively when a tenant edits a setting.


### TD-012 closing note — what shipped, and what deliberately did not

**Consumed:** `tenant.timezone`, by `useDateFormat()` on ~20 display sites and by
the three day-grouping sites covered in TD-025. `tenant.locale` governs date
ordering and month names through `Intl`.

**NOT consumed: `tenant.dateFormat`.** The control stays disabled, with copy
saying so.

The reason is that consuming it would create a second, competing source of
truth. `Intl.DateTimeFormat(locale)` already produces the correct ordering for a
locale; layering an explicit `MM/DD/YYYY` pattern on top means a tenant can set
`locale: en-GB` and `dateFormat: MM/DD/YYYY` and get a contradiction the UI has
no principled way to resolve.

Two honest options for whoever picks this up:

1. **Drop the column.** If the locale is the source of truth for ordering,
   `dateFormat` is redundant and its presence in Settings is misleading.
2. **Make it an explicit override** that visibly supersedes the locale for dates
   — which needs its own formatting path (not `dateStyle`) and UI copy
   explaining the precedence.

Doing neither and quietly reading the field would be the worst outcome: two
settings that disagree, with the winner decided by implementation accident.

---

## TD-026 — REVIEWED (time-primitive pass): duplication retained deliberately, now covering three functions

**The duplication is deliberate. Do not delete either copy assuming it was an
oversight.**

- `backend/src/shared/domain/time/tenantDay.ts`
- `frontend/src/utils/tenantDay.ts`

### Why there are two

Backend and frontend are separate npm packages with no shared module path:

- there is no root `package.json` and no npm/pnpm workspace,
- `backend/tsconfig.json` has `include: ["src/**/*"]`, so it cannot reach
  frontend sources, and its `paths` aliases resolve only within `src/`.

There is therefore no import either side could write. The definition of a
calendar day had to be duplicated to be shared at all.

### What holds them together today

An **identical fixture table asserted in both suites**:

- `backend/tests/unit/shared/tenantDay.test.ts`
- `frontend/src/utils/tenantDay.test.ts`

Nine cases covering the original UTC+3/UTC+2 defect, zones behind UTC, both DST
transitions, a half-hour zone (UTC+5:45) and exact-midnight ownership. Change
one implementation without the other and its suite fails on the shared table.
Both files carry a header pointing at the other.

This is discipline enforced by a test, which is weaker than a compiler. It is
adequate — it has a real failure mode that surfaces immediately — but it is not
free.

### The trigger for unifying

**If this repository ever gains a workspace root or a shared package, these two
files are the first thing to move into it.** Likely triggers:

- adopting npm/pnpm workspaces (e.g. for a shared `types` package — the
  frontend and backend already redeclare several DTO shapes independently),
- extracting an SDK for the API,
- adding a third consumer (a mobile client, a scheduled job) that also needs to
  know what "today" means for a tenant — at which point a third copy would be
  clearly unacceptable.

The shared fixture table moves with them and becomes a single suite.

### Related duplication worth moving at the same time

Not yet tracked separately, but noticed while doing this work — several
constants are declared on both sides and kept in sync by hand:

- `SUPPORTED_LOCALES` (`Tenant.ts` / `useTenantSettings.ts`)
- `SUPPORTED_LANGUAGES` (`Tenant.ts` / `i18n/config.ts`)
- `DATE_FORMATS` (same pair)
- the quotation / client / product / appointment status enums
  (`statusKeys.ts` mirrors backend domain enums)

None currently has a cross-checking test the way `tenantDay` does, so they are
in fact *weaker* than the duplication this entry is about. Worth folding into
the same effort.

---

# Batch remediation pass — closing record

Cleared in one pass: TD-002, TD-013, TD-018, TD-020, TD-021, TD-022, TD-023,
TD-024. Verification at the bottom of this section. Three new items were opened
by the work itself: **TD-027**, **TD-028**, **TD-029**.

## What each fix actually was

**TD-022 — appointment assignment.** The three invented staff options
(`value="1" | "2" | "3"`) are replaced by `useTeam().staff` rendered through
`getStaffDisplayName`, the same pattern `ClientFormContent` uses. Deactivated
members are excluded.

There was **no existing convention** to match: `/auth/staff` returns deactivated
members too (`GetTenantStaffUseCase` projects `isActive` but does not filter,
and `findByTenantId` is an unfiltered `findMany`), and **no frontend site
filtered on `isActive` at all**. So the convention was established here —
exclude — on the stated reasoning that assigning new work to someone who can no
longer sign in is never the intent.

`ClientFormContent`'s assignee dropdown was brought to the same rule, with one
difference that matters: it is also an **edit** form, so a client already
assigned to a deactivated member keeps that member as a visible option. Without
that exception, opening and saving such a client would have silently reassigned
it, because the select would have had no option matching the stored value. That
is a bug the naive filter would have introduced.

Also removed from the same file, both fully dead with no domain field to wire
to: the **Appointment Type** select (bound to nothing — no `register`, no
`value`, no `onChange`) and the **High Priority** toggle (its own comment
already recorded that the value was never submitted or persisted).

**TD-021 — identifier leaks. The audit said 3 sites; there were 21.**

| Site | State found |
|---|---|
| `QuotationDetailContent` status history | `By User: 3f2a9c1b` — truncated UUID |
| `QuotationDetailContent` "Created By" | **full raw UUID**, not in the audit |
| 18 page headers | `User 3f2a9c1b` built inline in each file |
| `AppointmentDetailPanel` status badge | **raw enum**, missed by the Stage 2 sweep |

The 18 page headers are the notable find. `getUserDisplayName` already existed
and was already used correctly by all three shells — but eighteen page
components each rebuilt `` `User ${user.userId.substring(0, 8)}` `` inline
instead. Every one now calls the helper. This is the same defect class as the
enum leaks, and it was the most widespread instance in the codebase.

The **quotation reference** displays (`quotation.id.split('-')[0]`) were
deliberately **left alone**. The instruction was to resolve them "through the
same staff lookup", but a reference code is not a person and the lookup cannot
produce one. A real fix is a per-tenant sequence (`QUO-2026-0042`) persisted on
the row — schema plus backfill, as TD-021 itself scoped. Left as-is rather than
half-changed.

**TD-013 — fabricated metrics. The audit's framing was wrong on one point.**

The entry asserted the Super Admin telemetry panel "never got" the
`Coming in Phase 5` badge. **It had one.** The badge was present and rendering.
The real defect was subtler: `.placeholderOverlay` is
`background-color: transparent`, so the badge is a small centred pill floating
over figures that stay fully legible — `24ms` beside a live-looking pulse dot,
and `14.2k/s`. A badge does not neutralise a specific number.

So the fix was not "add the badge" but "stop rendering the numbers": both are
now `---`, matching what this page's own KPI cards already show for
unimplemented metrics, and the pulse dot is gone.

The sweep also found **three fabricated figures the audit's list of nine
missed**, all on `StaffDashboard`/`SuperAdminDashboard`:

- `KPICard title="My assigned clients" value="156"` with trend label "Active
  Portfolio" — an invented portfolio size shown to a rep as their own.
- `KPICard title="Active Tenants"` — the **count is real**, but it carried a
  hard-coded `trendValue="+12%"`, `trendLabel="vs last month"` and
  `progress={72}`. **This is the most credible fabrication found**, precisely
  because the number beside the invented movement is true. No month-over-month
  tenant series is computed anywhere, so the trend props are removed rather
  than replaced.
- `"Today, Oct 24"` — a fixed date that stayed on that day forever, on a
  dashboard whose entire subject is today. Now renders the real current date.

The "My Stats" panel (revenue / closed / win rate) is now `---` plus the
disclosure, per the instruction to disclose first and wire later.

**TD-020 — placeholder sweep.** Per element:

| Element | Decision |
|---|---|
| Client list "Recent Activity" column | **Removed** — constant dash, no source; a header promises a per-row value |
| `TenantManagementTable` "Plan" / "Status" | **Removed** — same reasoning; Tenant tracks neither |
| `CategoryList` "Hierarchy Health" | **Removed** — Category has no `parentId`; there is no hierarchy in the model at all |
| `CategoryList` "Quick Audit" count | **Made real** — now the actual count of empty categories |
| `CategoryList` "Run System Cleanup" | **Disabled** — see TD-027, this one is destructive |
| Quotation "Download PDF" | **Disabled + title** — was a live-looking button whose only action was an `alert()` after the click |
| `ClientDetailContent` Filter / Search | **Left as-is** — already `disabled` + `title`, which is this app's established convention |

**TD-002 — the typecheck gap.** `backend/tsconfig.test.json` extends the base
with `include: ["src/**/*", "tests/**/*"]` and `noEmit`, wired to
`npm run typecheck:tests` and run in CI before the suites. It passes clean
today, so it locks in a good state rather than papering over a broken one.

**TD-018 — the lint gate.** All three rules are now `error`:
`rules-of-hooks`, `exhaustive-deps`, `jsx-no-literals`. **All three report
zero findings.** `jsx-no-literals` fell from 46 to 0 — 35 from the TD-013/020/
022/024 fixes, 2 genuine strings extracted here ("Create Your Workspace",
"New Entry"), and 9 in `.stories.tsx` files, which are exempted by an override
because story literals are demo fixtures that must *not* be translated.

No fabricated value was ever added to `allowedStrings` — the sequencing
recorded under TD-020 was followed: fix the lie, then let the linter enforce
honesty.

The gate was **verified to bite**, not assumed: introducing one raw literal
returns exit 1; removing it returns exit 0.

**TD-023 — password copy.** All three screens now read one key,
`auth.passwordHelper` ("Min 8 chars, 1 uppercase, 1 lowercase, 1 digit."),
matching the `z.string().min(8)` the backend enforces on all three flows. The
per-screen keys are deleted, so the copy cannot drift from the rule again. The
wrong Albanian translation of the wrong English is corrected with it.

**TD-024 — dead scaffolding.** `src/stories/` deleted entire (no importer
outside itself). Also deleted, same family and found by the lint run:
`fix-all.cjs`, `fix-final.cjs`, `recover.mjs` — one-off codemods left in the
frontend root, unreferenced, recoverable from git history. `recover.mjs` even
pointed at a path outside the repository.

## Verification

| Run | Suites / Files | Tests |
|---|---|---|
| Backend parallel | **109 / 109** | **636 / 636** (178.5s) |
| Backend serial (`--runInBand`) | **109 / 109** | **636 / 636** (140.8s) |
| Frontend (vitest) | **28 / 28** | **187 / 187** (28.3s) |

Backend typecheck (`src` + `tests`): clean. Frontend typecheck (`tsc -b`):
clean. Lint: exit 0 with all three rules at `error`. Translations: 800/800 both
languages, 0 reviewed by design (TD-019).

---

## TD-027 — RESOLVED (follow-up pass): "unused" is now a real query, and cleanup is unbounded

**Status:** 🔴 **OPEN — the control is DISABLED in the UI pending a decision.
Needs its own conversation; do not silently "fix" the semantics.**
**Found:** during the TD-020 sweep.

This is why the CategoryList instance was flagged as the priority one — but the
reality is worse than TD-020 recorded. The concern there was that a fabricated
"3 Unused Categories" sat above a real button. The button is not merely acting
on a wrong count.

**The endpoint has no concept of "unused" at all.**

`PrismaCategoryRepository.findLeastRecentlyUsedCategories`:

```sql
WHERE c."tenantId" = ${tenantId} AND c."isArchived" = false
GROUP BY c.id
ORDER BY last_used_at ASC
LIMIT ${limit};
```

There is **no predicate on the category being empty, unreferenced, or unused**.
It returns the N least-recently-*touched* non-archived categories, whatever they
are. A tenant whose categories are all actively in use gets three real ones
archived for the crime of being the oldest-touched.

**And the fabricated number had propagated into the backend.**
`inventoryController.cleanupCategories`:

```ts
limit: 3 // Fixed limit matching UI mock
```

The comment says it outright. A mock number in a design became a hard-coded
bound on a destructive server-side operation, and
`ArchiveUnusedCategoriesUseCase` defaults to the same `3`. Its unit test asserts
`toHaveBeenCalledWith('tenant1', 3)` — so the fabrication is currently
**encoded as a passing test**.

### What was done here, and what deliberately was not

Done: the widget now shows the **real** count of empty categories, and the
button is `disabled` with honest copy.

Deliberately not done: changing what cleanup means. Deciding whether "unused"
means zero products, or no recent stock movement, or something else — and
whether the operation should be bounded at all, or preview before archiving —
is a product decision about a **destructive action on real tenant data**.
Choosing it silently inside a batch pass is exactly the failure mode this
project has been auditing.

Backend code is untouched; the endpoint, hook and use case all still exist, so
reinstating is a one-line UI change once the semantics are agreed.

**Open questions for that conversation:** what qualifies as unused; whether the
`LIMIT` should exist; whether the user should see and confirm the specific
categories first; and whether the existing unit test should be rewritten, since
it currently asserts the mock-derived `3`.

---

## TD-028 — RESOLVED (follow-up pass): the no-op typecheck command is gone, not just documented

**Status:** 🔴 **RESOLVED in tooling, recorded because it invalidated earlier
reporting.**

`frontend/tsconfig.json` is a solution file:

```json
{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }
```

With `"files": []` and no `include`, `npx tsc --noEmit` compiles **zero files**
and exits 0. It looks exactly like a passing typecheck.

This was found the only way it could be: a deliberately broken import
(`from 'utils/userUtils'`, a bad relative path) produced a clean `tsc --noEmit`
and 18 `TS2307` errors under `tsc -b`.

**Consequence that must be stated plainly: every "frontend typecheck clean"
reported in earlier sessions used `tsc --noEmit` and therefore verified
nothing.** Those greens were not evidence. The suites and the build (`tsc -b &&
vite build`) were still real, so this is a reporting failure rather than a
proven defect backlog — but it is not safe to assume the frontend was
continuously typechecked before this pass.

**Fix:** `npm run typecheck` is now `tsc -b --force`, and CI runs it with a
comment warning against "simplifying" it back to `--noEmit`.

**Generalisable lesson, worth applying to the next tool added:** a check that
cannot fail is worse than no check, because it consumes the attention that would
otherwise notice its absence. Any new gate should be proven to fail on a
deliberate violation before it is trusted — as the lint gate was in this pass.

---

## TD-029 — RESOLVED (time-primitive pass): one shared dayBounds primitive, both sides

**Status:** OPEN. Found during the TD-013 work. **Not fixed here on purpose.**

`StaffDashboard.tsx`:

```ts
const startOfDay = new Date();
startOfDay.setHours(0, 0, 0, 0);
const endOfDay = new Date();
endOfDay.setHours(23, 59, 59, 999);
```

This is the **fourth** definition of "day" in the codebase and a residual
instance of the defect TD-025 closed. Stage 4 unified the dashboard KPI, the
calendar and the mobile agenda onto the tenant timezone via `dayBoundsInZone` /
`useDateFormat`; this range, which drives the rep's "My Schedule" table and the
mobile "appointments today" count, was missed.

**Effect:** a rep in a different timezone from their tenant sees a schedule
computed on a different day boundary from the dashboard KPI directly above it —
the exact disagreement TD-025 was closed to eliminate.

### Why it is flagged rather than fixed

`useDateFormat` exposes `dayKey` and `isSameDay` but **no `dayBounds`**, so the
fix means adding a frontend twin of the backend's `dayBoundsInZone` — a new
shared time primitive, not a call-site edit. It changes which appointments a
user sees.

TD-025 was fixed as one coordinated change with a shared fixture table asserted
on both sides, at explicit instruction. This deserves the same treatment, not a
quiet edit buried in a placeholder batch. It should also be done together with
**TD-026** (the `tenantDay.ts` duplication), since both concern the same
primitive.

### Scope, so this can be picked up without re-deriving it

**Confirmed reviewed and left open deliberately** — this is not an oversight of
the batch pass, it is a deferral with the treatment specified.

The one call site found: `frontend/src/pages/dashboard/StaffDashboard.tsx`,
the `startOfDay` / `endOfDay` pair feeding `useAppointmentsByDateRange`. It
drives two visible things — the "My Schedule" table and, on mobile, the
`appointmentsToday` count in the subtitle.

What the fix requires, in order:

1. **Add `dayBounds(zone, dayOffset)` to `frontend/src/utils/tenantDay.ts`**,
   as the twin of the backend's `dayBoundsInZone`. The backend already has it;
   the frontend copy has only `dayKeyInZone` and `isSameDayInZone`.
2. **Extend the shared `TIMEZONE_DAY_FIXTURES` table** — the same 9-case table
   asserted in both `backend/tests/unit/shared/tenantDay.test.ts` and
   `frontend/src/utils/tenantDay.test.ts` — to cover bounds, not just day keys.
   That table is the only thing holding the two copies in agreement (TD-026),
   so a new primitive that is not in it is a new place for them to drift.
3. **Expose it through `useDateFormat`**, which is how every other date concern
   reaches components, then replace the `setHours` pair.
4. **Sweep for a fifth instance** before closing. `setHours(0, 0, 0, 0)` is the
   signature; this one survived Stage 4 precisely because the sweep went by
   call site rather than by pattern.

**Do TD-026 at the same time.** Both are about the same primitive, and adding a
fourth function to a hand-duplicated file is the moment to decide whether the
duplication should continue.

---

## TD-030 — RESOLVED (time-primitive pass): list renamed, badge added, reactivation implemented

Found while establishing the deactivated-staff convention for TD-022. It began
as a labelling nit and did not stay one.

### The labelling part

`/auth/staff` returns every user including deactivated ones —
`GetTenantStaffUseCase` projects `isActive` but does not filter, and
`findByTenantId` is an unfiltered `findMany`. Team Settings renders that list
under a heading reading **"Active Members"**, with an empty state of "No active
staff members found." No frontend site filtered on `isActive` anywhere before
TD-022.

### The part that makes it more than labelling

**There is no reactivation path in the product at all.** Verified:

- `IUserRepository.setActive(userId, isActive)` accepts a boolean, and
  `PrismaUserRepository` implements it correctly.
- **The only caller is `DeactivateUserUseCase`, which passes `false`.** Nothing
  anywhere passes `true`.
- `authRoutes.ts` exposes `POST /staff/:id/deactivate` and no counterpart.

So deactivation is **one-way**. A Business Owner who deactivates the wrong
person cannot undo it from the UI — the account is retained in the database,
which the confirmation copy correctly promises, but there is no way to bring it
back.

This also undercuts the original reasoning for keeping deactivated members
visible ("so they can be managed"). Today they cannot be managed at all; the
rows are inert.

### Proposal (as requested — proposed, not picked)

**Recommended: keep the list inclusive, add a status badge, and add
reactivation.** Concretely:

1. Rename the heading from "Active Members" to **"Team Members"**, and the
   empty state to match. The list is already inclusive; the label is what is
   wrong, and renaming is strictly cheaper than filtering.
2. Add a **Deactivated** badge on those rows, reusing the existing `Badge`
   component and the `isActive` flag the endpoint already returns. No API
   change.
3. Add **`POST /staff/:id/reactivate`** calling `setActive(userId, true)`,
   Business-Owner-only, mirroring the deactivate route. This is the part with
   real value: it makes deactivation reversible and makes the retained account
   mean something.
4. Only then consider a filter toggle, and only if a tenant's list is long
   enough to need it. Defaulting to hiding deactivated members would recreate
   the current problem in the opposite direction — invisible accounts that
   still exist.

**Why inclusive-plus-badge over a separate section:** the two-list layout
already exists on this page for Active Members vs Pending Invitations, and a
third list would make a screen that is mostly headings. A badge scales to any
number of deactivated members without adding structure.

**One thing to check during implementation:** reactivating a user whose
warehouse was deleted, or whose role no longer exists, needs a decision.
Reactivation should probably validate the assignment the same way the invite
flow does rather than restoring a stale one.

---

# Follow-up pass — closing record

Cleared: **TD-011**, **TD-027**, **TD-028**. Confirmed-and-deferred with full
scope written down: **TD-029**, **TD-030**.

## TD-027 — what "unused" now means

Implemented to the agreed two-part definition, as a single SQL question:

```sql
AND NOT EXISTS (SELECT 1 FROM "Product" p
                WHERE p."categoryId" = c.id AND p."isArchived" = false)
AND NOT EXISTS (SELECT 1 FROM "QuotationLineItem" qli
                JOIN "Product" p2 ON p2.id = qli."productId"
                WHERE p2."categoryId" = c.id)
```

`findLeastRecentlyUsedCategories(tenantId, limit)` is **gone from the
interface**, replaced by `findUnusedCategories(tenantId)` — no limit parameter
exists to pass a fabricated number to. The controller's `limit: 3 // Fixed
limit matching UI mock` is deleted.

**Interpretation that had to be decided, stated explicitly:** "zero products
currently assigned" is read as *no **active** product*. Archived products do
not keep a category in use — archiving is how a catalogue retires a product —
but they *do* still carry their category, which is what makes the historical
quotation check meaningful. Without that reading the second condition would be
vacuous: if a category had no products at all, no line item could join to it,
and the two conditions would collapse into one.

**Known limitation, recorded rather than discovered later:** the link from a
line item to a category runs through `Product.categoryId`, which is *current*
state. If a product is reassigned to another category, the evidence it was ever
quoted under the old one is gone from the database. Closing that means
snapshotting the category on `QuotationLineItem` at write time. Until then,
"historically" means "as far back as the current product-to-category
assignment can attest".

**The test that encoded the bug is deleted, not adjusted.**
`expect(...findLeastRecentlyUsedCategories).toHaveBeenCalledWith('tenant1', 3)`
asserted a fabricated constant, which made the defect look deliberate. The unit
suite now covers authorisation, archiving *every* candidate (with a fixture of
five, deliberately more than the old bound), naming what was archived, and
preview not mutating.

`tests/integration/inventory/categoryCleanup.test.ts` seeds the three cases
against a real database:

| Category | Fixture | Expected |
|---|---|---|
| `A Empty` | no products at all | **flagged unused** |
| `B Historic` | one *archived* product carrying 1 QuotationLineItem | **not flagged** |
| `C Active` | one active product | **not flagged** |

plus: exactly 1 candidate for that fixture (not 3), preview is read-only,
cleanup archives **5** when 5 are unused (impossible under the old `LIMIT 3`),
a second run is a no-op, STAFF gets 403 and nothing is archived, and another
tenant's unused category is untouched.

**The UI count and the button now come from one query.** A new
`GET /categories/cleanup/preview` returns the candidates; the widget renders
`candidates.length` and the confirmation dialog **names the categories** rather
than counting them. The button is re-enabled and disables itself when there is
nothing to archive.

## TD-011 — framed correctly: a mass-assignment closure

`req.body = await schema.parseAsync(req.body)`. The value of that assignment is
not tidiness: `z.object()` strips undeclared keys, and three auth handlers pass
the body **wholesale** into a use case —
`registerUseCase.execute(req.body)`, likewise `acceptInvitation` and
`resetPassword`. Discarding the parsed object meant any property a client
invented travelled all the way in. That path is now closed.

The 400 body changed from the raw `ZodError` to `{ error, details }`, matching
what every controller already returns, so clients no longer see two different
error shapes depending on which validation path a route happens to use.

**The tests were verified to fail against the old implementation** — 6 of 7 fail
before the fix, 7 of 7 pass after — so they guard the behaviour rather than
passing vacuously. This is the same discipline applied to the lint gate in the
previous pass, and the reason is TD-028: a check that cannot fail is worse than
no check.

## TD-028 — removed rather than documented

The frontend was already correct (`typecheck` = `tsc -b --force`). The residual
risk was in the **backend**, which had two scripts: `typecheck`
(`tsc --noEmit -p tsconfig.json`, src only) and `typecheck:tests`
(src + tests). The weaker one was a strict subset of the stronger and sat under
the more obvious name — exactly the shape that gets run by mistake.

There is now **one `typecheck` script per package**, and the backend's is the
full src + tests check. `typecheck:tests` no longer exists as a name.

**It proved itself immediately.** The first run of the new backend typecheck
after the TD-027 interface change failed with two stale doubles:

```
src/inventory/application/use-cases/CategoryUseCases.test.ts(18,7): error TS2353:
  'findLeastRecentlyUsedCategories' does not exist in type 'Mocked<ICategoryRepository>'
src/inventory/application/use-cases/GetCategoriesUseCase.test.ts(15,7): error TS2353:
  'findLeastRecentlyUsedCategories' does not exist in type 'Mocked<ICategoryRepository>'
```

That is the TD-002 failure class — the one that had broken the suite silently
three times — caught at build time on its fourth occurrence, within minutes of
the guard existing.

---

# Time-primitive pass — closing record (Notifications precondition)

Cleared: **TD-030**, **TD-029**, **TD-026** (reviewed and consciously retained).
One new small item opened: **TD-031**.

## TD-030 — reactivation, not just a rename

Three parts, as proposed and approved:

1. The heading is **"Team Members"**, not "Active Members". The
   `team.activeMembers` key is deleted rather than left behind, so it cannot be
   reused by accident.
2. Deactivated rows carry a **Deactivated** badge, from the `isActive` flag the
   staff endpoint already returned. No API change was needed for this part.
3. **`POST /staff/:id/reactivate`** — the part with real value.
   `ReactivateUserUseCase` mirrors `DeactivateUserUseCase`: Business-Owner-only,
   idempotent, and enforcing tenant isolation **on the record**, not just the
   route. That last check matters more here than on the deactivate side —
   without it, reactivation would be a way to restore access across a tenant
   boundary that deactivation was used to remove. It has its own test.

The row's action button now swaps between deactivate and reactivate on
`isActive`, so a deactivated member is actionable rather than an inert row.

**Not restored on reactivation, deliberately:** nothing but sign-in. Deactivation
leaves clients and appointments assigned where they were, so there is nothing to
put back. The one thing that can differ is `warehouseId` — the FK is optional,
so a warehouse deleted while the member was inactive has already nulled it, and
they return with no warehouse scope rather than a dangling one. Visible and
correctable in Team Settings.

## TD-029 — one primitive, one fixture table, all call sites

`dayBoundsInZone(timeZone, offsetDays, now)` is now in
`frontend/src/utils/tenantDay.ts`, a verbatim port of the backend's, along with
the private `zoneOffsetMs` it needs. `useDateFormat` exposes it as
`dayBounds(offsetDays)`, which is how components reach it.

**The existing 9-row fixture table was extended, not replaced.** Two columns
were added to the same rows — `expectedStart` and `expectedEnd` — and the table
remains **byte-identical** between
`frontend/src/utils/tenantDay.test.ts` and
`backend/tests/unit/shared/tenantDay.test.ts` (verified programmatically, 3360
characters on both sides).

The two DST rows are what make it worth having:

| Row | Day length |
|---|---|
| `Europe/Tirane` spring-forward, 2026-03-29 | **23 hours** (23:00Z → 22:00Z) |
| `America/New_York` fall-back, 2026-11-01 | **25 hours** (04:00Z → 05:00Z) |

Any implementation that reaches the end of a day by adding 24 hours fails both.

Beyond the constants, three **properties** are asserted per row on both sides:
the instant falls inside its own day; `dayBoundsInZone` and `dayKeyInZone`
cannot disagree about which day it is; and yesterday's end is exactly today's
start, so consecutive ranges neither gap nor overlap.

**The fixture was verified to catch drift rather than assumed to.** Replacing
the frontend copy's day-end with `start + 24h` fails exactly the two DST rows,
on that side only; restoring it returns 49/49. This is the same red-then-green
discipline used for the lint gate and the TD-011 tests, and the reason is
TD-028: a check that cannot fail is worse than none.

### The sweep, by pattern

`setHours(0, 0, 0, 0)` / `setHours(23, 59, ...)` / `toDateString()` across both
packages found three hits:

| Site | Verdict |
|---|---|
| `StaffDashboard.tsx:27,29` | **Fixed** — the known TD-029 site |
| `CalendarContent.tsx:296` | **Not a defect** — see below |
| `GetTenantClientMetricsUseCase`, `tenantDay.ts` | Comments describing the old code |

`CalendarContent`'s `d.toDateString() === selectedDate.toDateString()` compares
two Dates both derived from the same local `today`, and only decides which pill
in the date strip is highlighted. Which appointments belong to the selected day
is already answered by `isSameDayInZone` in the tenant's zone. Left as-is with
an inline comment recording that it was swept, so the next pass does not
re-flag it.

**No fifth instance was found.** The predicted one turned out to be this false
positive.

## TD-026 — reviewed, retained, and now more expensive

The conditions for unifying have not been met: still no root `package.json`, no
workspace, and `backend/tsconfig.json` still has `include: ["src/**/*"]`, so
neither side could import the other even if it wanted to.

What changed is the price. **Three functions are now mirrored** rather than two,
plus the private `zoneOffsetMs`. Both file headers say so explicitly and point
here. The fixture table is doing real work — it caught a deliberate drift during
this pass — but it is a convention, and conventions are what the next person
skips.

**Recommendation unchanged and now more urgent:** the first of a workspace, a
shared types package, or a third consumer should absorb this. Notifications
would have been that third consumer had this pass not landed first.

---

## TD-031 — `findByDateRange` is inclusive (`lte`) while every other day query is half-open (`lt`)

Small, found while wiring TD-029's fix.

The server's own day arithmetic is half-open: `GetTenantClientMetricsUseCase`
queries `scheduledAt: { gte: today.start, lt: today.end }`, matching what
`dayBoundsInZone` returns. But `PrismaAppointmentRepository.findByDateRange` —
the query behind `useAppointmentsByDateRange` — applies `gte` / **`lte`**.

So handing `dayBounds()`'s exclusive end straight to that endpoint would include
an appointment scheduled at exactly tomorrow's tenant-local midnight, which
would have reintroduced a KPI-vs-schedule disagreement in the opposite
direction from the one TD-029 closed.

**Handled at the call site, not in the shared repository.** `StaffDashboard`
steps back one millisecond, with a comment explaining why. Changing `lte` to
`lt` in the repository would silently narrow the calendar's month window too
(`CalendarContent` is the other caller), and that is not a change to make
incidentally while fixing something else.

**The real fix** is to make the repository half-open and adjust both callers
together, so there is one boundary convention in the codebase rather than two.
Cheap, but it needs its own before/after check on the calendar.

---

# Notifications v1 — build record

In-app only, event-triggered, per-recipient, polled, keyed content. No
scheduler, no email, no preferences — as scoped.

One new item opened by the work: **TD-032**.

## What it does

Eleven event types across four areas, each stored as an **i18n key plus
params**, never a rendered sentence:

| Area | Types |
|---|---|
| Quotations | submitted-for-approval, approved, returned-to-draft, accepted, rejected, expired |
| Appointments | assigned, rescheduled, cancelled |
| Clients | assigned |
| Team | invitation accepted |

`GET /:tenant/notifications`, `PATCH /:tenant/notifications/:id/read`,
`PATCH /:tenant/notifications/read-all`. A bell in the app header and a list
page at `/:tenant/notifications`, polling every 60s.

**The bell replaced a dead control.** `AppLayout` already had a
`<button aria-label="Notifications">` with a bell icon and no handler — one more
of the TD-020 family, found while wiring the real one.

## The three rules, centralised

`NotificationService` is the only place notifications are created, so three
rules live in one file rather than eleven call sites:

1. **Never notify the actor about their own action.** Approving your own
   quotation must not badge your own bell.
2. **Never notify a deactivated user (TD-010).** Their token stays valid for up
   to an hour after deactivation, so recipients are filtered on the **record**.
   `toRole` fan-out uses the new `findActiveByTenantAndRole`; explicitly named
   recipients are re-checked individually, because an appointment can be
   assigned to someone deactivated moments earlier.
3. **Emitting must not break what triggered it.** Sites outside a transaction
   call `emitSafe`, which swallows its own failure — a saved appointment must
   not be lost to a failed notification. Sites *inside* the quotation write
   transaction call `emit` directly, so the notification commits or rolls back
   with the change it describes.

Tenant isolation is also enforced on the record: a recipient id belonging to
another tenant is dropped rather than trusted.

## Storage decision, as agreed

**Entity labels are snapshots; people are resolved live.**

`params` carries `{ reference }`, `{ client }`, `{ email }` — what the thing was
called when it happened. `actorUserId` is a column, resolved at render time
through the same `findPersonById` / `getStaffDisplayName` helpers the client
list and quotation detail use (TD-021), so a colleague's name reads as it is
now. An actor no longer in the staff projection falls back to a name-shaped
string, never a raw UUID.

**Dates are never stored formatted.** `APPOINTMENT_RESCHEDULED` stores an ISO
instant and the client formats it through `useDateFormat`, so it follows the
tenant timezone and locale like every other date (TD-029). A server-rendered
date string would have been frozen in one locale in a row read days later.

## Retention

Opportunistic prune-on-fetch, scoped to the fetching user's own rows: 90 days
read, 180 days unread. No scheduler exists in this project, and a policy that
depends on infrastructure which does not exist is not a policy. A tenant nobody
visits never prunes, which is harmless precisely because nobody is querying it.
Pruning failure is swallowed and logged — housekeeping must not stop someone
seeing their notifications.

## Preconditions that were genuinely required

**`Invitation.invitedByUserId`** — the database had no record of who invited
whom, so "your invitation was accepted" had nobody to notify. The controller had
been passing `invitingUserId` all along; there was simply nowhere to put it.
Nullable, because invitations predating the column cannot be attributed — and in
that case the notification is **skipped rather than redirected to all Business
Owners**, since guessing a recipient would make an unattributable event look
attributed.

**`CreateAppointmentDTO.actingUserId`** — cancel and reschedule already carried
`changedByUserId`; create carried no actor at all. Taken from the token in the
controller, never the body, so a client cannot attribute an appointment to
someone else.

## Verification

| Run | Suites / Files | Tests |
|---|---|---|
| Backend parallel | **115 / 115** | **736 / 736** (56.6s) |
| Backend serial | **115 / 115** | **736 / 736** (43.9s) |
| Frontend (vitest) | **31 / 31** | **246 / 246** (30.4s) |

Backend typecheck (src + tests), frontend typecheck (`tsc -b`), lint with all
three rules at `error`, and translations 831/831 in both languages: all clean.

Coverage worth naming specifically: tenant isolation on list, mark-one and
mark-all; a notification addressed to the same user id under a different tenant
staying invisible; 404-not-403 when marking someone else's row (a 403 would
confirm the id exists); deactivated owners excluded from fan-out against a real
database; both retention horizons including the case that proves they differ;
and pruning never touching another user's rows.

---

## TD-032 — RESOLVED: `PrismaUnitOfWork` is a no-op — a safety mechanism that does not do what its name promises

**Status:** ✅ **RESOLVED, 2026-07-28**, during Super Admin tenant provisioning.
`PrismaUnitOfWork` and `IUnitOfWork` are **deleted**; their only caller,
`RegisterBusinessOwnerUseCase`, now provisions through
`ITenantProvisioningTransaction`, which binds its repositories to `tx` the way
`IQuotationWriteTransaction` already did. See "Resolution" at the end of this
entry.

**The live question this entry asked was answered first, and the answer was
yes:** `RegisterBusinessOwnerUseCase` was genuinely non-atomic. A failure
between the tenant write and the user write left an orphan workspace — a tenant
holding a unique `urlSlug` that nobody could sign into and nobody could
re-register. This is now proven in both directions by
`tests/integration/tenant/tenantProvisioningAtomicity.test.ts`, which contains
a **control case** reconstructing the old arrangement by hand and asserting it
*does* leave the orphan. A rollback test with nothing to fail against proves
nothing.

**Production was checked before any of this shipped** (read-only, `.env.prod`):
4 tenants, **0 orphans**, 0 tenants without a BUSINESS_OWNER. The bug was real
but had not yet bitten. Nothing needed cleaning up.

**Original entry follows.**

**Status at the time:** 🔴 **OPEN, priority-adjacent to TD-011's tier.** The quotation
transitions are fixed by a different mechanism, described below; the class
itself is untouched and still misleading.

**Why this tier, explicitly:** it is the same *shape* of bug as TD-011 — not the
same blast radius, but the same failure mode. A mechanism whose name promises a
guarantee, which callers reasonably trust, and which silently provides nothing.
TD-011 was `validateRequest` appearing to enforce a schema while discarding its
output; this is `PrismaUnitOfWork` appearing to make writes atomic while leaving
every repository outside the transaction. Both are worse than an absent
mechanism, because an absent one gets noticed.

**The first thing to check when this is picked up — do this before deciding
whether to fix or delete:** `RegisterBusinessOwnerUseCase` is the class's only
caller and is written as though it is transactional. It creates a Tenant and a
User together. **It is almost certainly non-atomic right now**, which would mean
a failure partway through can leave a tenant with no owner — an orphan workspace
nobody can sign in to. That is a live production question, not a cleanup one,
and it should be answered with a test that forces a mid-operation failure and
checks nothing landed, exactly as `notificationEmission.test.ts` does for the
quotation path.

### The finding

```ts
export class PrismaUnitOfWork implements IUnitOfWork {
  async execute<T>(work: () => Promise<T>): Promise<T> {
    return await prisma.$transaction(async (tx) => {
      // In a real implementation, you'd pass `tx` down to repositories.
      return await work();
    });
  }
}
```

It opens a transaction and hands the work **nothing**. Every repository inside
keeps using the global client, so nothing joins the transaction. Its own comment
says so.

The instruction for this feature was to wrap the six quotation transitions in
"the existing IUnitOfWork" because the mechanism was "already tested elsewhere".
It is used in exactly one place — `RegisterBusinessOwnerUseCase` — and it does
not do what its name says. Wrapping six use cases in it would have produced
**the appearance of atomicity with none of the substance**, which is worse than
the honest gap it replaced and is the same defect class as a check that cannot
fail (TD-028) or a badge over fabricated numbers (TD-013).

### What was built instead

`IQuotationWriteTransaction` + `PrismaQuotationWriteTransaction`, which
constructs its repositories **bound to `tx`** and hands them to the caller. That
is the entire difference. All six transitions now write quotation, history and
notification through it, so the two previously independent awaits — where a
crash left a quotation whose own history did not record how it got there — are
one atomic unit.

**Proven, not assumed.** `notificationEmission.test.ts` approves a DRAFT
quotation, which throws inside the transaction after the writes would have
happened, and asserts the notification, the history row and the status change
are all absent afterwards. That test fails against a `PrismaUnitOfWork`-style
wrapper.

### Resolution (2026-07-28)

`ITenantProvisioningTransaction` + `PrismaTenantProvisioningTransaction`, built
to exactly the same shape as the quotation port above: the repositories are
constructed **inside** `$transaction`, bound to `tx`, and handed to the caller.
That required making `PrismaTenantRepository` and `PrismaUserRepository` accept
an injected client instead of importing the global one at module scope — which
is precisely why no wrapper could ever have enrolled them before, `IUnitOfWork`
included.

- **Both provisioning paths share one implementation.**
  `CreateTenantWithOwnerUseCase` owns the logic;
  `RegisterBusinessOwnerUseCase` (public self-registration) and
  `POST /api/tenants` (Super Admin) are two callers with different
  pre-conditions. The admin path could not inherit the atomicity gap because
  there is only one path to inherit from.
- **`PrismaUnitOfWork` and `IUnitOfWork` are deleted**, not left in place with a
  warning comment. A no-op named `UnitOfWork` sitting in the tree is how the
  next person wraps something in it and believes they got atomicity.
- **The slug race is handled too.** The uniqueness check moved inside the
  transaction, and a lost race (Postgres P2002) is translated to
  `SlugAlreadyTakenError` rather than surfacing as an opaque Prisma error.

**Proven in both directions.**
`tests/integration/tenant/tenantProvisioningAtomicity.test.ts` forces a failure
after the tenant write and asserts no tenant row survives — *and* includes a
control that rebuilds the old global-client-inside-`$transaction` arrangement
and asserts it **does** leave an orphan with zero owners. If that control ever
stops failing, the rollback test has stopped discriminating.

### Left open

- `MarkQuotationAcceptedUseCase` keeps its stock deduction in a **separate**
  transaction, sequentially, exactly as before. Prisma rejects nested
  interactive transactions, and merging them means rewriting the stock path —
  an inventory-correctness change that should not ride along with a
  notification feature. The pre-existing boundary between "stock moved" and
  "quotation accepted" is unchanged.

---

## Notifications — deliberately NOT in v1

Recorded so the next person does not have to re-derive the scope:

- **No scheduler**, therefore no "remind me 1 hour before" and no digests. This
  is the single largest piece of work the feature could have grown, and
  avoiding it is why v1 is purely event-triggered.
- **No email.** `IEmailSender` exists and works, so this is a follow-on rather
  than a rewrite — but it brings deliverability, unsubscribe and bounce
  handling with it.
- **No per-user preferences.** Cheap to add once there is evidence about which
  events people actually want; expensive to guess now.
- **Low stock excluded on purpose.** It is a *condition*, not an *action* —
  there is no moment at which it "happens", so it needs either polling or a
  scheduler, both of which v1 does not have.

---

## TD-033 — Templated bulk edits across use cases have twice silently dropped logic (2x recurring)

**Status:** OPEN — a process control, not a code defect. Logged the same way
TD-002 was: after the second occurrence, not the first.

**Severity:** Medium-High. Both occurrences removed real authorisation or audit
behaviour, and neither was noticed by the person making the change. Both were
caught by pre-existing tests — which is the only reason this is a near-miss log
rather than an incident report.

### The two occurrences

| # | When | What the template assumed | What it destroyed |
|---|---|---|---|
| 1 | Group 3 Stage 3, batch 8 | that an import anchor appeared once per file | truncated 4 component files; inserted an import inside a multi-line `import {` block |
| 2 | Notifications v1 | that six quotation transitions shared one shape | `ExpireQuotationUseCase` lost its **STAFF ownership guard** entirely; `Approve` and `ReturnToDraft` had their **role check moved after the lookup**, changing which error an unauthorised caller sees; `ReturnQuotationToDraftUseCase` lost the **`note`** it wrote into status history |

Occurrence 2 is the more serious of the two. A dropped role guard is a
**security regression**, and the reordering is the kind of change that looks
harmless in review — the guard is still there, just later — while altering
whether a caller can distinguish "you may not do this" from "that does not
exist".

### The root cause is the same both times

A template is written from **one** example file and applied to N. It encodes
what that one file happened to contain. Anything the other N−1 files had that
the example did not — an extra guard, a differently-ordered check, an additional
field on a constructed object — is not transformed. It is **deleted**, silently,
because the template rewrites the whole file rather than editing part of it.

This is a distinct failure mode from every other class in this project. It is
not a stale dependency array, not a drifted double, not a fabricated value. It
is *correct code being removed by an edit that had no idea it existed*.

### The control

**Any bulk or templated edit that rewrites more than one use case must be
diffed per file against `git show HEAD:<path>` before the pattern is trusted to
have held.** Not spot-checked — every touched file.

Concretely, before moving on from a templated pass:

1. `git diff` each rewritten file and read the **deletions**, not the additions.
   The additions are what was intended; the deletions are where the damage is.
2. Confirm every `if (...) throw` present before is present after, **in the same
   position relative to I/O**. Position is behaviour.
3. Confirm every field of every constructed domain object survived. Occurrence 2
   lost a `note` this way.
4. Prefer targeted edits over whole-file templates when the files are known to
   differ — which, in a codebase with per-use-case authorisation rules, is the
   normal case rather than the exception.

### Why a template was still the right tool both times

Worth stating so the lesson is not "never automate". Six near-identical use
cases genuinely did need the same structural change, and hand-editing six files
invites a different error — inconsistency. The fix is not to stop templating; it
is to **treat a templated edit as untrusted output requiring review**, the same
way generated code is.

**Related:** TD-002 (the typecheck gap, also logged after its second
occurrence). The tests caught both of these, which is an argument for the
existing suite, not for relying on it — a use case with thinner coverage would
have shipped the dropped guard.

---

## TD-034 — CI's "Test (parallel)" step does not run in parallel

**Status:** Open
**Raised:** 2026-10-02, while unblocking the Milestone 2 PRs (#25, #27)
**Severity:** Medium — the isolation the step is meant to prove is not being exercised
**Area:** `backend/package.json` (`test` script), `.github/workflows/ci.yml` (backend job)

### What happened

The backend job aborted on #25 and #27 with `FATAL ERROR: Ineffective
mark-compacts near heap limit … JavaScript heap out of memory` (exit 134) in
"Test (parallel)". No test had failed. Two other stacked PRs passed the same
run, so it was intermittent: the run sat right at the limit.

### Why

`npm test` is `jest --forceExit --detectOpenHandles`. In Jest 29,
`--detectOpenHandles` forces in-band execution
(`@jest/core/build/testSchedulerHelper.js`: `if (runInBand || detectOpenHandles)`),
because it cannot detect leaks inside workers. So the "parallel" step runs all
~270 suites in one Node process, the same as the "serial" step, and that one
heap grew with each Milestone 2 slice until it passed Node's ~2 GB default.

### What was done

Both Test steps now run with `NODE_OPTIONS=--max-old-space-size=4096`. That
fixes the abort. It does not make the step parallel.

### The remaining risk

The CI comment says both orderings run "because per-worker schema isolation is
what makes the parallel run trustworthy". Today neither step runs more than one
worker, so a fixture leak between workers (TD-001) would not be caught in CI.

### Fix when picked up

Run the parallel step without `--detectOpenHandles` (for example
`npx jest --forceExit`), keep `--detectOpenHandles` on the serial step, and fix
whatever the real parallel run exposes before relying on it.
