# Mock data for a demo or test database

`npm run seed:mock` fills the Wellness Albania workspace with realistic data: staff for every role (including a
custom Wellness+ Coordinator role), thirty businesses with contacts, deals at every stage, activities and
follow-ups, priced offers and discount approvals, contracts in every status with instalments, invoices and
receipts, renewals, and Wellness+ members with families, payments, VIP requests, employee imports and card checks.

Everything goes through the real HTTP API, so prices, numbers, dates, history and audit entries are the app's own.
It refuses to run on a workspace that already has companies.

## Load it into a database

```bash
cd backend
npm run seed:wellness -- --owner-email admin@wellness-albania.al --owner-password '<pw>'   # the empty workspace
npm run seed:mock     -- --password '<pw for every mock user>'
npm run jobs:run                                                                           # the daily jobs, once
```

## Make a SQL file for phpMyAdmin

Build a throwaway MySQL 8 with the production schema (`nevacrm_full_import.sql`, then
`mysql_upgrade_to_current.sql`), point `DATABASE_URL` at it, run the three commands above, then:

```bash
mysqldump --no-create-info --skip-triggers --no-tablespaces --skip-comments --complete-insert \
  --default-character-set=utf8mb4 --ignore-table=<db>._prisma_migrations <db> > nevacrm_mock_data.sql
```

Import it into an empty production-schema database (after both schema scripts). Contract PDFs and pictures are
files: set `UPLOADS_DIR` while seeding and copy `<UPLOADS_DIR>/<tenant id>/` to `backend/uploads/` on the server.

The schema scripts need MySQL 8; they do not run on MariaDB.
