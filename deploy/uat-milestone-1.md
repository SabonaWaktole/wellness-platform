# Milestone 1 UAT on staging

How to prepare staging for Wellness Albania's acceptance tests, and the tests
themselves (SRS §8.1, UAT-1 to UAT-5), with the seeded user who runs each
step. Wellness Albania runs the scenarios; the development team does §1–§3
first.

---

## 1. Prepare staging

Set up staging as `deploy/DEPLOY.md` §4 describes (HTTPS, `NODE_ENV=production`,
database upgraded), then seed it:

```bash
cd backend
npm run seed:wellness -- --owner-email <administrator email> --owner-password '<pw>'
npm run seed:uat -- --password '<pw for the UAT users>' --companies 10000
```

`seed:uat` is safe to re-run: it only adds what is missing. It creates the
users below (the email domain can be changed with `--email-domain`), plus:

- **Seven named companies** (`UAT …`). Each has a business type, area, city,
  employee count and two contacts with positions, a note and a call.
- **Contracts:** `UAT Kafe Blloku` (Sales User A) and `UAT Fabrika Durrës`
  (Sales User B) each have an active contract, €2,400 a year, with the first
  payment recorded as paid.
- **10,000 bulk companies** (`UAT Bulk Company …`), split between Sales
  User A, Sales User B and unassigned, for the performance check.

| Role | Sign-in | Used in |
|---|---|---|
| Sales User A | `uat.sales.a@wellness-albania.al` | UAT-1, UAT-2 |
| Sales User B | `uat.sales.b@wellness-albania.al` | UAT-1 (the other salesperson) |
| Sales Manager | `uat.manager@wellness-albania.al` | UAT-1 |
| Reception | `uat.reception@wellness-albania.al` | UAT-1, UAT-3 |
| Administrator | the `seed:wellness` owner | UAT-1, UAT-3, UAT-5 |
| CEO | `uat.ceo@wellness-albania.al` | UAT-1 |
| Sales User (to become Reception) | `uat.rolechange@wellness-albania.al` | UAT-5 step 1 |
| Sales User (leaving) | `uat.leaver@wellness-albania.al`; owns `UAT Fabrika e Largimit` and `UAT Qendra e Largimit` | UAT-5 step 2 |

**Placeholder lists.** Business types, risk levels, areas and cities are still
the placeholder seed (SRS §8.3) unless Wellness Albania's lists have arrived.
If they have, load them through Settings → Lists before UAT. The UAT steps work
with either set, but `seed:uat` looks up *Kafene*, *Qendër thirrjesh*,
*Fabrikë*, *Tiranë* and *Durrës* by name, so run it before replacing those.

## 2. Pre-flight checklist (development team)

| # | Check | How | Result |
|---|---|---|---|
| P1 | HTTPS only, HSTS on the frontend and API | the `curl` checks in `DEPLOY.md` §4 | |
| P2 | `NODE_ENV=production` on the API | sign in, then check the `jwt` cookie in the browser's dev tools: it shows `Secure`, `HttpOnly`, `SameSite=None` | |
| P3 | Database matches the code | `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.mysql.prisma` says `No difference detected.` | |
| P4 | Legacy migration rehearsed on a production copy | `deploy/legacy-client-migration.md`: dry run, **report reviewed with Wellness Albania**, apply, spot-check | |
| P5 | NFR-PERF-01 on staging | `npm run perf:staging -- --api https://<api>/api --tenant wellness-albania --email uat.manager@… --password …`: every p95 under 1,000 ms. Record the table below. | |
| P6 | Device pass (NFR-USE-01) | §4 | |
| P7 | CI green on the release commit | all jobs, including `mysql`, `e2e-mobile` and `traceability` | |
| P8 | Neva origins removed from the CORS allowlist | `deploy/security-review-m1.md` §3 | |

**Performance reference.** Measured locally on Postgres with the same seed
(10,000 companies), 20 runs each. Staging numbers go in the second column.

| Query | Local p95 (Sales Manager) | Staging p95 |
|---|---|---|
| session (`/auth/me`) | 6 ms | |
| company list, first page | 23 ms | |
| text search | 79 ms | |
| contact phone search | 80 ms | |
| needs-completion filter | 38 ms | |
| business type / area filter | 10 ms | |
| permission check (cached / cache miss) | 0.002 ms / 3 ms | not measured on staging (in-process) |

## 3. Reset between runs

- **UAT-3** removes a permission from Reception. Add it back afterwards (Settings → Roles & permissions → Reception).
- **UAT-5** changes `uat.rolechange` to Reception and deactivates `uat.leaver`. To run it again:
  1. change `uat.rolechange` back to Sales User;
  2. reactivate `uat.leaver`;
  3. move the two `…e Largimit` companies back to `uat.leaver` by editing each company's salesperson.

## 4. Device pass (NFR-USE-01)

The `mobile-360` Playwright project checks every Milestone 1 screen at 360 px in
CI. Its sign-in is rate-limited, so run it at most a few times per 15 minutes:

```bash
cd frontend && E2E_ADMIN_PASSWORD='<pw>' npx playwright test --project=mobile-360
```

A person still has to do the pass on real devices: run UAT-1 step 1 and UAT-2
on each device below and tick it.

| Screen | Chrome (desktop) | Safari (iPhone) | Chrome (Android) |
|---|---|---|---|
| Sign in, forgot password | | | |
| Company list, search, filters | | | |
| Company form (create and edit, contacts) | | | |
| Company detail (contacts, timeline, contract validity) | | | |
| Settings: Team, Roles, Audit log, Lists, Statuses, Workspace | | | |

## 5. The UAT scenarios (Wellness Albania)

### UAT-1: each role sees only what it should

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Sales User A | Open the company list | Only A's companies (including `UAT Kafe Blloku` and `UAT Qendra e Thirrjeve Arta`); no `UAT Fabrika Durrës` | |
| 2 | Sales User A | Open a link to `UAT Fabrika Durrës` (copy it from the Administrator's view) | "Not found" | |
| 3 | Sales Manager | Open the company list | Every salesperson's companies and the unassigned ones | |
| 4 | Reception | Search `+355690000001` and open the result (`UAT Kafe Blloku`) | Contacts and contract validity are shown; no prices, amounts or payments anywhere | |
| 5 | Administrator | Open Settings | The admin panel: Team, Roles, Lists, Statuses, Audit log, Workspace | |
| 5 | CEO | Open the company list, a company, and the audit log | Sees everything; the audit log is read-only; no Settings unless granted | |

### UAT-2: create and edit a company with the new fields

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Sales User A | Create a company: business type, employees, area, city, address, and two contacts with positions | Saved; the risk level fills in from the business type; A is the salesperson | |
| 2 | Sales User A | Change its business type | The risk level changes with it | |
| 3 | Sales User A | Try to type a city that is not in the list | Not possible: only the chosen area's cities are offered | |
| 4 | Sales User A | Look at the company's history, and filter the list by its business type, area and city | It appears in the timeline and in each filter | |

### UAT-3: setting changes recorded in the audit log

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Administrator | Settings → Lists → Business types: change a type's risk level | Saved | |
| 2 | Administrator | Settings → Lists → Cities: add a city | Saved | |
| 3 | Administrator | Settings → Roles & permissions → Reception: remove "view contract validity" | Saved. Reception's next page no longer shows contract validity. | |
| 4 | Administrator | Settings → Audit log | Three entries, each with user, time, and old and new values | |

### UAT-4: language and branding

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | anyone | Open the sign-in page | Wellness Albania branding; Albanian by default | |
| 2 | any user | Sign in, switch to English, then back to Albanian | Every text and every lookup value (business types, areas, cities, statuses) switches language | |

### UAT-5: role change and deactivation

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Administrator | Settings → Team: change `uat.rolechange` from Sales User to Reception | `uat.rolechange`'s next page shows the Reception view, without signing in again | |
| 2 | Administrator | Deactivate `uat.leaver` | Asked to reassign their two companies; after choosing Sales User A, both move and the user can no longer sign in | |
| 3 | Administrator | Settings → Audit log | The role change, the deactivation and each company reassignment are listed | |

## 6. Sign-off

| Scenario | Result (pass / fail + note) | Tested by | Date |
|---|---|---|---|
| UAT-1 | | | |
| UAT-2 | | | |
| UAT-3 | | | |
| UAT-4 | | | |
| UAT-5 | | | |
| Pre-flight (§2) | | | |
| Device pass (§4) | | | |

Milestone 1 accepted by Wellness Albania: ______________________  Date: __________
