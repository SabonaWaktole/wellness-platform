# Milestone 3 UAT on staging

How to prepare staging for Wellness Albania's acceptance tests, and the tests
themselves (Milestone 3 SRS §9.1, UAT-1 to UAT-7), with the seeded user who
runs each step. Wellness Albania runs the scenarios; the development team does
§1–§6 first. Milestone 3 builds on Milestones 1 and 2, so
`deploy/uat-milestone-1.md` §1 and `deploy/uat-milestone-2.md` §1 still apply and
their users are the ones used here. UAT-1 continues from the won deal of
Milestone 2 UAT-1, and UAT-7 step 4 runs both earlier sets again.

---

## 1. Prepare staging

Set staging up as `deploy/DEPLOY.md` describes (HTTPS, `NODE_ENV=production`,
database upgraded), then seed it:

```bash
cd backend
npm run seed:wellness -- --owner-email <administrator email> --owner-password '<pw>'
npm run seed:uat -- --password '<pw for the UAT users>' \
  --companies 10000 --deals 2000 --follow-ups 5000 \
  --activities 5000 --contracts 500 --instalments 6000
```

`seed:uat` is safe to re-run: it adds only what is missing. The Milestone 3 part
adds, to the Milestone 1 and 2 data:

- **A new user, Sales User C** (`uat.sales.c@…`), whose only activity is the SRS
  §5.3 example, so its figures are exactly the ones the SRS gives: **last month
  it won 4 deals of €592.80, €600.00, €1,200.00 and €480.00 a year and lost 6**
  (conversion rate 40%, sales value €2,872.80). It is used in UAT-5 and UAT-6.
- **Contracts in every status**, each made from its own won deal and numbered
  from the contract sequence, on `UAT M3 Company A` (Sales User A) and
  `UAT M3 Company B` (Sales User B). The price is the UAT-1 one, €49.40 a month:

  | Company | Status | Notes |
  |---|---|---|
  | A | Draft | starts in 10 days |
  | B | Pending Signature | |
  | A | Active | 12 monthly instalments, one of **every** payment status; the Payment Pending one is **due yesterday** (UAT-3) |
  | B | Active, **ends in 25 days** | ten instalments paid; the Not Invoiced one is **due yesterday** (UAT-3); UAT-7 starts here |
  | A | Suspended | with its reason |
  | B | Expired | ended 10 days ago |
  | A | Cancelled | with its reason |

  Every contract that was ever signed carries the **sample signed PDF**
  (`backend/scripts/uat/fixtures/sample-signed-contract.pdf`), which you can also
  use to try the document upload (UAT-1 step 4).
- **Instalments in every payment status**, with a receipt row for every amount
  received, so the Payments overview, the contract summary and the CEO's revenue
  have figures.
- **500 contracts, 6,000 instalments and 5,000 activities** (and the 2,000 deals
  and 5,000 follow-ups of Milestone 2), for the performance check (§4).
- The two Milestone 1 contracts (`UAT Kafe Blloku`, `UAT Fabrika Durrës`) are now
  written to the database, because a workspace on the sales process refuses a
  contract that is not made from a won deal. They are Legacy contracts (no deal),
  Active, with a paid annual instalment and the sample PDF.

The users (the email domain can be changed with `--email-domain`):

| Role | Sign-in | Used in |
|---|---|---|
| Sales User A | `uat.sales.a@wellness-albania.al` | UAT-1, 2, 3, 5, 6, 7 |
| Sales User B | `uat.sales.b@wellness-albania.al` | UAT-3, 7 |
| Sales User C | `uat.sales.c@wellness-albania.al` | UAT-5, 6 |
| Sales Manager | `uat.manager@wellness-albania.al` | UAT-3, 4, 5, 6, 7 |
| Reception | `uat.reception@wellness-albania.al` | UAT-4, 5 |
| Administrator | the `seed:wellness` owner | UAT-2, 3, 5 |
| CEO | `uat.ceo@wellness-albania.al` | UAT-5, 6 |

**The authorized payment user** (UAT-2, UAT-3) is the Administrator, who holds
`payments.update` by default. If Wellness Albania wants a Finance role, create it
from Settings → Roles and give it to a user before the UAT; the steps are the
same.

**Running the daily jobs.** The scheduler runs every job once when the API
starts and then on its timers. To run a job on demand, or for a chosen day,
use the one-off command (it needs no running API, and writes for every
workspace, so use it on staging only):

```bash
cd backend
npm run jobs:run -- --list
npm run jobs:run -- --only payments-overdue                   # today
npm run jobs:run -- --only contract-renewal-reminder --now 2026-12-01T09:00:00Z
```

The jobs select by state, so `--now` only decides what "today" is; nothing
changes the server's clock.

**Real inputs.** Placeholder seeds stand in for what Wellness Albania has not
sent (SRS §9.3). If the real values have arrived, load them through Settings
before the UAT and note below what is still a placeholder. The scenarios work
with either set.

| Input | Real value loaded? |
|---|---|
| Authorized payment users, and whether a Finance role is wanted | |
| Reminder lead times (default 60, 30, 7 days), expiring-soon window (30 days), grace days (0) | |
| Standard contract terms text | |
| A sample signed contract PDF | the generated one is used |
| Confirmation of the dashboard figures for each role (SRS §5.2) | |

## 2. Pre-flight checklist (development team)

| # | Check | How | Result |
|---|---|---|---|
| P1 | HTTPS only, HSTS | the `curl` checks in `DEPLOY.md` §4 | |
| P2 | `NODE_ENV=production`; a signed contract is not a public file | `curl -I https://<api>/uploads/<tenant>/%63ontract-x.pdf` is 404, and the same with `contract-x.pdf` | |
| P3 | Database matches the code | `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.mysql.prisma` says `No difference detected.` | |
| P4 | Migration rehearsal on a production copy (NFR-OPS-03) | §3 | |
| P5 | NFR-PERF-04 on staging | §4 | |
| P6 | Daily jobs on the staging clock (NFR-REL-01) | §5 | |
| P7 | Device pass at 360 px (NFR-USE-03) | §6 | |
| P8 | CI green on the release commit | all jobs, including `mysql`, `e2e-mobile` (now with the Sales User, Sales Manager and CEO dashboards), `traceability` and the translation check | |
| P9 | Neva origins removed from the CORS allowlist | `deploy/security-review-m3.md` §3 | |
| P10 | `npm run check:translations` passes; notification texts and dashboard labels read in Albanian and English; numbers and dates formatted in both (NFR-I18N-03) | switch the language on the CEO dashboard, Renewals and a notification | |
| P11 | Every Must requirement is named in a test (NFR-MNT-03) | `node scripts/check-traceability.mjs --list`; review the Should and Could lines | |
| P12 | `deploy/security-review-m3.md` read by the team, and `/security-review` run on the release branch | | |

## 3. Migration rehearsal (NFR-OPS-03)

On a copy of the production database (never on production itself). The upgrade
converts contract and instalment money from Float to Decimal(12,2), gives each
instalment a default status, marks the existing contracts Legacy (no deal),
and replaces the old per-contract reminder marker with the reminder table.

```bash
mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql   # keep this
mysql -u USER -p COPY < backend/prisma/mysql_upgrade_to_current.sql | tee upgrade-1.txt
mysql -u USER -p COPY < backend/prisma/mysql_upgrade_to_current.sql | tee upgrade-2.txt   # only "skip:" lines
```

The Float → Decimal step **stops** and lists every amount that would change by
half a cent or more when rounded to two decimals (the rounding report,
`m3_amounts_would_change_review_the_rows_listed_above`). Read the rows with
Wellness Albania; if they are acceptable, run `SET @m3_rounding_reviewed := 1;`
in the same session and run the upgrade again. On PostgreSQL the same check
raises an error until `m3.rounding_reviewed` is set to `on`.

Count amounts before and after:

```sql
SELECT COUNT(*), ROUND(SUM(amount), 2) FROM Contract;
SELECT COUNT(*), ROUND(SUM(amount), 2), ROUND(SUM(paidAmount), 2) FROM ContractPayment;
```

| Check | Expect | Result |
|---|---|---|
| Second run | only `skip:` lines | |
| Rounding report | empty, or reviewed with Wellness Albania and recorded here | |
| `prisma migrate diff` (P3) | `No difference detected.` | |
| Contracts and instalments before and after | same counts; each sum equal to two decimals | |
| Existing contracts | no deal, and shown as Legacy | |
| Existing instalments | status unchanged by the new default (paid ones stay Paid) | |
| The old reminder marker | gone; reminders recorded once per lead time | |
| A backup exists and has been restored once on a scratch database | | |

The same checks on PostgreSQL were run on 05.10.2026 (Slice 15): `prisma migrate
diff` between the migrations and `schema.prisma` reports `No difference
detected.` The MySQL rehearsal and the production copy are for the team to run.

## 4. Performance (NFR-PERF-04)

Seed as in §1 (2,000 deals, 5,000 activities, 500 contracts, 6,000 instalments)
and run the script three times: as the Administrator, as the CEO and as the Sales
Manager. The CEO and the Sales Manager see the Performance screen; the CEO also
sees the CEO dashboard and the Payments overview.

```bash
cd backend
npm run perf:staging -- --api https://<api>/api --tenant wellness-albania \
  --email <user> --password '<pw>' --runs 20
```

The script exits with an error if any p95 reaches its budget.

| Query | Budget (p95) | Local, Postgres, 05.10.2026 | Staging p95 |
|---|---|---|---|
| each dashboard (Administrator, CEO, Sales Manager, Sales User), year and month | 2,000 ms | 24–114 ms | |
| Performance screen, year with comparison, last month, records | 2,000 ms | 13–70 ms | |
| contract list, first page and Active | 2,000 ms | 12–29 ms | |
| Payments overview and Overdue | 2,000 ms | 9–24 ms | |
| Renewals | 2,000 ms | 8–10 ms | |

The local column is the development team's rehearsal on a laptop with the same
volumes and a real server (10,000 companies, 2,000 deals, 5,000 follow-ups and
activities, 509 contracts, 6,030 instalments). No index was missing. If a query
misses its budget on staging, add the index in a migration and write it here.

## 5. Daily jobs on the staging clock (NFR-REL-01)

The tests run each job twice, after a two-day gap and with a failing
notification. On staging, with the seed from §1, run each job for the days
below and check that nothing is sent or changed twice:

```bash
cd backend
# Overdue: yesterday's Payment Pending becomes Overdue, the Not Invoiced one does not
npm run jobs:run -- --only payments-overdue
npm run jobs:run -- --only payments-overdue          # again: nothing
# Expiry and reminders after a two-day gap
npm run jobs:run -- --only contract-expiry,contract-renewal-reminder --now "$(date -u -d '+2 days' +%FT09:00:00Z)"
npm run jobs:run -- --only contract-expiry,contract-renewal-reminder --now "$(date -u -d '+2 days' +%FT09:00:00Z)"   # again: nothing
```

| Job | Twice in a row | After a two-day gap | Failing notification (stop the mail relay, run, start it, run) | Result |
|---|---|---|---|---|
| `payments-overdue` | | | | |
| `contract-expiry` | | | | |
| `contract-renewal-reminder` | | | | |

## 6. Device pass (NFR-USE-03)

The `mobile-360` Playwright project checks every Milestone 1, 2 and 3 screen at
360 px in CI: the three contract screens, the Payments overview, Renewals,
Performance, Settings → Contracts and payments, and the four dashboards (the
Administrator's with the Administrator session, the others by signing in as the
seeded users). Its sign-in is rate-limited, so run it a few times per 15 minutes
at most:

```bash
cd frontend && E2E_ADMIN_PASSWORD='<pw>' E2E_SALES_USER_PASSWORD='<pw>' \
  E2E_MANAGER_PASSWORD='<pw>' E2E_CEO_PASSWORD='<pw>' npx playwright test --project=mobile-360
```

A person still has to do the pass on real devices: open each screen, scroll it,
and use its main control.

| Screen | Chrome (desktop) | Safari (iPhone) | Chrome (Android) |
|---|---|---|---|
| Contract list and filters | | | |
| Contract page (details, instalments, history, document) | | | |
| New contract from a won deal | | | |
| Payments overview and its totals | | | |
| Renewals (tabs and reminders) | | | |
| Performance (filters, total row, drill-down) | | | |
| Sales User dashboard | | | |
| Sales Manager dashboard | | | |
| Administrator dashboard | | | |
| CEO dashboard | | | |
| Settings → Contracts and payments | | | |

## 7. Reset between runs

- **UAT-1** wins nothing new, but makes a contract from the won deal of Milestone 2 UAT-1 and activates it, which moves the company to Client. To repeat it, win another deal first (Milestone 2 UAT-1 step 1).
- **UAT-2** records an invoice and receipts on the new contract's first instalment. A receipt can be reversed and the status corrected (with a comment) while nothing is received. To repeat, use another instalment.
- **UAT-3** changes the seeded instalment due yesterday to Overdue. Correct its status back with a comment while nothing is received, or re-seed on a fresh workspace.
- **UAT-4** suspends the contract of UAT-1 and reinstates it (the contract is valid again at the end).
- **UAT-5, UAT-6** change nothing.
- **UAT-7** sends reminders and, at step 3, **expires every contract that ends before the date you pass to `--now`**, including bulk ones. It also starts a renewal on the seeded contract that ends in 25 days. Repeat it on a fresh seed, or on the other contract that ends soon.

## 8. The UAT scenarios (Wellness Albania)

Money is in euro. Steps name the seeded user; "the authorized user" is the Administrator.

### UAT-1: won deal to active contract

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Sales User A | Open the won deal of Milestone 2 UAT-1 (`UAT Restorant Tirana`) and create the contract | The contract number is `CTR-<year>-nnnn`, the price **€49.40 a month**, the annual value **€592.80**, the package and services are the offer's, and the end date is 12 months after the start, minus one day | |
| 2 | Sales User A | Check the filled values; try to type a different price | The price is read only | |
| 3 | Sales User A | Mark it Pending Signature | The values are locked | |
| 4 | Sales User A | Try to activate without a document, then attach the sample signed PDF and activate | Activation is refused without the document. After it the status is Active and **12 instalments exist, all Not Invoiced** | |
| 5 | Sales User A | Open the company page | The company is a **Client**, and its timeline shows the contract and each status change | |

### UAT-2: payments

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Sales User A | Open the instalments of the contract and try to change one | Status and amounts are visible and there is no edit control; the API returns 403 | |
| 2 | Administrator | Record invoice `INV-1` on instalment 1, then mark it Payment Pending | It moves to Invoice Issued, then Payment Pending | |
| 3 | Administrator | Record a receipt of €20.00, then €29.40 | Partially Paid with €29.40 outstanding, then Paid | |
| 4 | Administrator | Try a further receipt of €1.00 | The extra receipt is refused | |
| 5 | Administrator | Open the instalment history and Settings → Audit log | The history and the audit log show every step with user and date | |

### UAT-3: overdue and the contract summary

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Administrator | Find the seeded instalment due yesterday in Payment Pending (contract of `UAT M3 Company A`) and the one due yesterday that is Not Invoiced (contract of `UAT M3 Company B`, the one ending in 25 days) | Both are listed with yesterday's date | |
| 2 | development team | `npm run jobs:run -- --only payments-overdue` | The pending one becomes **Overdue, changed by the system**; the Not Invoiced one shows "Due, not invoiced" and is not Overdue | |
| 3 | Administrator, Sales User A, Sales Manager | Open the notifications | A notification reached the authorized user, the salesperson and the Sales Manager, and running the job again sends no second one | |
| 4 | Sales Manager | Open the Payments overview filtered by Overdue; open the contract | The overview lists the overdue instalment of the team with the totals; the contract summary adds up | |

### UAT-4: Reception checks validity

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Reception | Search the company of UAT-1 and open it | "Valid until" the end date, and the start date, and nothing else | |
| 2 | Reception | Try the contract endpoint directly (browser tools, or `curl` with the session) | No price, payment, deal or document field; the document endpoint returns 403 | |
| 3 | Sales Manager | Suspend the contract with a reason | | |
| 4 | Reception | Check the company again | "Not valid: Suspended" | |
| 5 | Sales Manager | Reinstate the contract; Reception checks again | Valid again | |

### UAT-5: dashboards

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Sales User A, Sales Manager, Administrator, CEO, Reception | Sign in, open the dashboard | Each role lands on its own dashboard; Reception opens the search | |
| 2 | Sales Manager, CEO | Compare the figures with the lists behind them (Pipeline, Contracts, Payments overview). Filter the Sales Manager's period to **Last month** and read Sales User C | The Sales Manager sees the sales team only and the CEO sees everything; the totals match the lists. Sales User C: **4 won, 6 lost, conversion rate 40%, sales value €2,872.80** | |
| 3 | Sales User A | Change the period; try to open another salesperson's figures (change the salesperson in the address) | Period figures change and "as of now" figures do not; the foreign request is refused (403) | |
| 4 | Administrator | Open the dashboard | The pricing configuration, the users per role and inactive users, the last 20 audit entries with a link to the full log, and items needing attention. **No sales figure** | |
| 5 | CEO | Open the dashboard; open a linked follow-up or contract | Read only: no edit control anywhere, and the CEO's writes return 403. Revenue, monthly recurring value, contracts and payments by status are shown; there is no Wellness+ area | |

### UAT-6: salesperson performance

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Sales Manager | Open Performance for this month | All indicators are shown per salesperson and in the total | |
| 2 | Sales Manager | Filter by Sales User C and by Last month | One row for that period: 4 won, 6 lost | |
| 3 | Sales Manager | Check the total row against the rows and the seed data | The conversion rate and the average time to close in the total are calculated from the data, not averaged from the rows | |
| 4 | Sales User A; CEO | Open Performance | Sales User A sees only their own row and no total; the CEO sees everyone | |

### UAT-7: renewal, then Phase 1 end to end

Run the commands from `backend/` on staging. Replace the dates with the ones `date` prints.

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | development team | The seeded contract of `UAT M3 Company B` ends in 25 days. `npm run jobs:run -- --only contract-renewal-reminder`; then at 18 days: `--now "$(date -u -d '+18 days' +%FT09:00:00Z)"`; then the same again | Sales User B and the Sales Manager each get the **30-day** reminder, then the **7-day** one, once each; the last run sends nothing | |
| 2 | Sales User B | Open the reminder, start the renewal, win it and create the contract | A Renewal deal exists; the new contract starts the day after the old end date and links to it ("Renews CTR-…") | |
| 3 | development team | Move the clock past the old end date: `npm run jobs:run -- --only contract-expiry --now "$(date -u -d '+26 days' +%FT09:00:00Z)"` | The old contract is **Expired by the system**, still in the history; the company stays **Client** | |
| 4 | the team | Run Milestone 1 UAT-1 to UAT-6 (`uat-milestone-1.md`) and Milestone 2 UAT-1 to UAT-6 (`uat-milestone-2.md`) again | All earlier scenarios still pass, including **Reception seeing no sales data** (M2 UAT-6) | |

## 9. Sign-off

| Scenario | Result (pass / fail + note) | Tested by | Date |
|---|---|---|---|
| UAT-1 | | | |
| UAT-2 | | | |
| UAT-3 | | | |
| UAT-4 | | | |
| UAT-5 | | | |
| UAT-6 | | | |
| UAT-7 | | | |
| Milestone 1 UAT-1 to 6 re-run | | | |
| Milestone 2 UAT-1 to 6 re-run | | | |
| Pre-flight (§2) | | | |
| Migration rehearsal (§3) | | | |
| Performance (§4) | | | |
| Daily jobs (§5) | | | |
| Device pass (§6) | | | |

Milestone 3 accepted by Wellness Albania: ______________________  Date: __________
