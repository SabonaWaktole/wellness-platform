# Milestone 2 UAT on staging

How to prepare staging for Wellness Albania's acceptance tests, and the tests
themselves (Milestone 2 SRS §11.1, UAT-1 to UAT-6), with the seeded user who
runs each step. Wellness Albania runs the scenarios; the development team does
§1–§4 first. Milestone 2 builds on Milestone 1, so `deploy/uat-milestone-1.md`
§1 still applies and its users are the ones used here.

---

## 1. Prepare staging

Set staging up as `deploy/DEPLOY.md` describes (HTTPS, `NODE_ENV=production`,
database upgraded), then seed it:

```bash
cd backend
npm run seed:wellness -- --owner-email <administrator email> --owner-password '<pw>'
npm run seed:uat -- --password '<pw for the UAT users>' --companies 10000 --deals 2000 --follow-ups 5000
```

`seed:wellness` also loads the SRS §4.1 pricing values (one band of 1–10 employees at a €30 base fee and €8 per employee, risk
0 / 10 / 20%, visit frequencies, price zones, the 10% cap, 12 months, 30 days), a "Standard" package with its services, the offer texts and a
published placeholder sales script. `seed:uat` is safe to re-run and checks
that the pricing and the script are there. It adds, to the M1 data:

- **`UAT Restorant Tirana`** (Sales User A): 2 employees, a Medium-risk business
  type (*Restorant*), Tiranë, with its New contract deal. UAT-1 can start from
  it, or create a new company as step 1 says.
- **A second deal** (`UAT-2 deal`) on `UAT Kafe Blloku`, for UAT-2.
- **Follow-ups and meetings** for Sales User A and B, on their first company:
  a follow-up due yesterday (overdue), one in 3 days, a meeting tomorrow and an
  online meeting in 2 days (UAT-4).
- **2,000 bulk open deals and 5,000 bulk open follow-ups** over the bulk
  companies, for the performance check (§2, P5).

The users are the Milestone 1 ones; the email domain can be changed with
`--email-domain`:

| Role | Sign-in | Used in |
|---|---|---|
| Sales User A | `uat.sales.a@wellness-albania.al` | UAT-1, 2, 3, 4 |
| Sales User B | `uat.sales.b@wellness-albania.al` | UAT-4 |
| Sales Manager | `uat.manager@wellness-albania.al` | UAT-3, 4 |
| Reception | `uat.reception@wellness-albania.al` | UAT-6 |
| Administrator | the `seed:wellness` owner | UAT-5 |
| CEO | `uat.ceo@wellness-albania.al` | UAT-4 |

**Real inputs.** Placeholder seeds stand in for what Wellness Albania has not
sent (SRS §11.3): the script text, the cities of each price zone, the services
and packages, the offer texts and bank details, the cap and the activity
results. If the real values have arrived, load them through Settings before the
UAT (Settings → Sales script, Pricing, Lists), and note below what is still a
placeholder. The scenarios work with either set, but UAT-1 expects **€49.40**,
which only holds with the SRS §4.1 values, so check them first.

| Input | Real value loaded? |
|---|---|
| Sales script, sq and en | |
| Final prices, bands above 10 employees | |
| Cities of each price zone | |
| Services and packages | |
| Offer template texts, company and bank details | |
| Discount cap | |
| Activity results | |

## 2. Pre-flight checklist (development team)

| # | Check | How | Result |
|---|---|---|---|
| P1 | HTTPS only, HSTS | the `curl` checks in `DEPLOY.md` §4 | |
| P2 | `NODE_ENV=production`; the workspace runs the sales process (public quotation link and email off, D6) | the `jwt` cookie shows `Secure`, `HttpOnly`, `SameSite=None`; opening `/api/public/quotations/<any token>` returns 404 | |
| P3 | Database matches the code | `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.mysql.prisma` says `No difference detected.` | |
| P4 | Migration rehearsal on a production copy (NFR-OPS-02) | §3 | |
| P5 | NFR-PERF-02 and 03 on staging | §4: calculation p95 < 300 ms, offer PDF < 3 s, board and calendar < 2 s | |
| P6 | Device pass (NFR-USE-02) | §5 | |
| P7 | CI green on the release commit | all jobs, including `mysql`, `e2e-mobile`, `traceability` and the translation check | |
| P8 | Neva origins removed from the CORS allowlist | `deploy/security-review-m2.md` §3 | |
| P9 | `npm run check:translations` passes; an offer downloaded in Albanian and in English, lists show Albanian and English names (NFR-I18N-02) | open one offer in both languages | |
| P10 | Every Must requirement is named in a test (NFR-MNT-02) | `node scripts/check-traceability.mjs --list` | |
| P11 | `deploy/security-review-m2.md` read by the team | | |

## 3. Migration rehearsal (NFR-OPS-02)

On a copy of the production database (never on production itself):

```bash
mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql   # keep this
mysql -u USER -p COPY < backend/prisma/mysql_upgrade_to_current.sql | tee upgrade-1.txt
mysql -u USER -p COPY < backend/prisma/mysql_upgrade_to_current.sql | tee upgrade-2.txt   # only "skip:" lines
```

The upgrade includes the interaction migration (every existing activity gets
`occurredAt` and a result) and the offer reference numbers. CI rehearses both
on every push with `backend/prisma/ci/mysql_check_activities.sql` and
`mysql_check_offer_numbers.sql`; run those two against the copy as well:

```bash
mysql -u USER -p COPY < backend/prisma/ci/mysql_check_activities.sql
mysql -u USER -p COPY < backend/prisma/ci/mysql_check_offer_numbers.sql
```

| Check | Expect | Result |
|---|---|---|
| Second run | only `skip:` lines | |
| `prisma migrate diff` (P3) | `No difference detected.` | |
| Interactions before and after | same count; none without `occurredAt` | |
| Companies, contacts, contracts, payments before and after | same counts | |
| The two check scripts | no failing row | |

## 4. Performance (NFR-PERF-02, NFR-PERF-03)

Sign in as the Administrator, who sees every deal:

```bash
cd backend
npm run perf:staging -- --api https://<api>/api --tenant wellness-albania \
  --email <administrator> --password '<pw>' --runs 20
```

Draft one offer on any deal first (UAT-1 does this), or the offer PDF is not
measured. The script exits with an error if any p95 reaches its budget.

| Query | Budget (p95) | Staging p95 |
|---|---|---|
| price calculation | 300 ms | |
| offer PDF, Albanian | 3,000 ms | |
| offer PDF, English | 3,000 ms | |
| pipeline board (2,000 open deals) | 2,000 ms | |
| deal list, first page and one stage | 2,000 ms | |
| calendar, month (5,000 follow-ups) | 2,000 ms | |
| calendar, day with overdue | 2,000 ms | |
| company queries (Milestone 1) | 1,000 ms | |

Measured locally on Postgres with the same seed: the board p95 was 44 ms with
2,004 deals. Staging numbers go in the table above.

## 5. Device pass (NFR-USE-02)

The `mobile-360` Playwright project checks every Milestone 1 and 2 screen at 360 px
in CI (the board, the lists, the deal page and edit form, the pricing screen,
the offers list, approvals, My follow-ups and the calendar's day, week, month and
agenda views). Its sign-in is rate-limited, so run it a few times per 15 minutes
at most:

```bash
cd frontend && E2E_ADMIN_PASSWORD='<pw>' npx playwright test --project=mobile-360
```

A person still has to do the pass on real devices: run UAT-1 steps 1–7 on each
device and tick it.

| Screen | Chrome (desktop) | Safari (iPhone) | Chrome (Android) |
|---|---|---|---|
| Pipeline board (scrolls inside its area, a card moves by its menu) | | | |
| Deal page (activities, offers, follow-ups) | | | |
| Sales script panel (covers the screen and closes) | | | |
| Pricing screen and the draft offer | | | |
| Offer preview and PDF download | | | |
| My follow-ups and the follow-up buttons | | | |
| Calendar (agenda on the phone, month on the desktop) | | | |
| Win, lose and reopen dialogs | | | |
| Discount approvals | | | |
| Settings → Pricing, Sales script | | | |

## 6. Reset between runs

- **UAT-1** wins a deal and makes its company a Client. To repeat it, create a new company in step 1.
- **UAT-2** loses the `UAT-2 deal`. The Sales Manager can reopen it (Reopen on the deal page).
- **UAT-3** changes nothing in the settings, but each run adds an offer to the deal. Use a new draft each time.
- **UAT-5** changes the Medium surcharge to 12%, adds a city to a zone and publishes a script version. Afterwards set Medium back to 10% (Settings → Pricing → Risk), remove the city from the zone, and publish the original script text again if the real text has not arrived.
- **UAT-4** uses the seeded follow-ups. Re-running `seed:uat` adds only what is missing.

## 7. The UAT scenarios (Wellness Albania)

### UAT-1: complete sale, won

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Sales User A | Create a company: 2 employees, a Medium-risk business type, city Tiranë; create its deal. (`UAT Restorant Tirana` is ready if you want to skip the form.) | Saved; the risk level fills in; the deal is New Lead | |
| 2 | Sales User A | Open the sales script and keep it open | The script stays open while you move between pages | |
| 3 | Sales User A | On the deal, record a call with the contact person, a result and feedback | The call is on the deal and the company history; the deal moves to Contacted | |
| 4 | Sales User A | Open the pricing screen: 2, Restorant, 2 visits per year, zone Tirana qendër | **€49.40 a month**, with the Example A breakdown | |
| 5 | Sales User A | Save the offer, preview it, download the PDF (Albanian, then English), mark it as sent | The PDF has every field, the branding and a sequential number (`OF-<year>-0001`); the deal moves to Offer Sent | |
| 6 | Sales User A | Schedule a follow-up "+3 days" | The deal moves to Follow-Up; the follow-up is in My follow-ups and in the calendar | |
| 7 | Sales User A | Complete the follow-up with a meeting, accept the offer and win the deal (close the open follow-ups) | The won deal shows the closing date, €49.40 a month, €592.80 a year, the package, the services and the salesperson; the company is a Client | |

### UAT-2: deal lost

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Sales User A | Create a second deal (or use `UAT-2 deal` on `UAT Kafe Blloku`) and move it to Negotiation | The stage history shows it | |
| 2 | Sales User A | Mark it Lost without a reason, then with a reason and a note | Without a reason it is refused. With one, the reason and note are on the deal and in the company history | |

### UAT-3: discount above the cap

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Sales User A | On a draft offer, give 5% (cap 10%) | Applies at once | |
| 2 | Sales User A | Give 15% with a reason | Waits for approval; the PDF download is disabled | |
| 3 | Sales Manager | Open the notification and approve 12% | The salesperson is notified; the offer shows 12% and can be downloaded | |
| 4 | Sales User A, Sales Manager | Repeat with 20%; the manager rejects it | The discount goes back to 10% with the manager's comment | |
| 5 | Administrator | Open the audit log | All four actions are listed with old and new values | |

### UAT-4: calendars

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Sales User A, B | Look at their calendars (the seeded items: one follow-up due yesterday, one in 3 days, a meeting and an online meeting); create one more of each kind | Each salesperson sees only their own items; the overdue one is red and listed under Overdue today | |
| 2 | Sales Manager | Open the team calendar and filter by salesperson | Sees both; the filter works; overdue follow-ups are listed | |
| 3 | CEO | Open the calendar | Sees all; read-only | |

### UAT-5: script and pricing administration

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Administrator | Settings → Sales script: edit the text and publish | Salespeople see the new script | |
| 2 | Administrator | Settings → Pricing: set the Medium surcharge to 12%; add a city to a zone | Saved | |
| 3 | Sales User A | Price a new offer, then reopen the offer from UAT-1 | The new price uses 12%; the UAT-1 offer still shows €49.40 | |
| 4 | Administrator | Settings → Audit log | The script publish and both pricing changes, with old and new values | |

### UAT-6: Reception sees no sales data

| Step | As | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Reception | Open the company from UAT-1 (search its name) | Contacts and contract validity are visible; no deals, offers, prices, discounts or script, and the menu has no sales entries | |

## 8. Sign-off

| Scenario | Result (pass / fail + note) | Tested by | Date |
|---|---|---|---|
| UAT-1 | | | |
| UAT-2 | | | |
| UAT-3 | | | |
| UAT-4 | | | |
| UAT-5 | | | |
| UAT-6 | | | |
| Pre-flight (§2) | | | |
| Migration rehearsal (§3) | | | |
| Performance (§4) | | | |
| Device pass (§5) | | | |

Milestone 2 accepted by Wellness Albania: ______________________  Date: __________
