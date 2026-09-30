# Legacy client data migration (Slice 14)

Moves existing companies onto the Slice 11/12 model — business type,
employee count, area, city, street address, NIPT, website and a primary
contact — without losing data (FR-CMP-08, NFR-OPS-01). Nothing here
overwrites a column that already has a value, so it is safe to run more
than once, including after users have started filling fields in by hand.

## 1. Write the mapping config

Copy `backend/scripts/legacy-client-mapping.example.json` and adjust it for
the tenant. Each entry names, in priority order, the legacy custom field(s)
whose value should fill that column, and an optional `values` map for
values that don't read as the same text (e.g. `"Hospitality"` → `"Kafene"`).

The config is reviewed by a person before every run — it is never guessed
at runtime.

## 2. Back up the database

**Always take a backup before `--apply`.**

```bash
# Postgres
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d-%H%M).sql

# MySQL (Hostinger)
mysqldump -h <host> -u <user> -p <database> > backup-$(date +%Y%m%d-%H%M).sql
```

## 3. Dry run

```bash
npm run migrate:legacy-clients -- \
  --tenant wellness-albania \
  --config path/to/mapping.json \
  --report legacy-migration-report.csv
```

Dry run is the default — nothing is written. The CSV lists, per company:
what's still missing after the plan (business type, area, city, employee
count, contact) and any issues (an unmatched lookup value, an ambiguous
city, a taken NIPT, an invalid email/phone/website, or a contact that would
be named after the company for lack of a mapped contact name).

**Review the CSV with Wellness Albania** before applying — this is the
point to catch a wrong mapping or a systematic lookup mismatch.

## 4. Apply

```bash
npm run migrate:legacy-clients -- \
  --tenant wellness-albania \
  --config path/to/mapping.json \
  --apply \
  --manifest legacy-migration-manifest.json
```

This writes the changes and creates the primary contact for companies that
had none, one transaction per company — a failure on one company is
reported and skipped, not fatal to the run. **Keep the manifest file**: it
is what `--revert` uses.

Run it again with the same config any time afterwards (a second run after
new legacy data arrives, say) — it only touches what is still unfilled.

## 5. Work through what's left

Companies still missing a field after the migration show up in the
"Needs completion" filter on the company list in the app, so the sales
team can finish them without leaving the app.

## 6. Rollback

Two options, in order of preference:

1. **Restore the backup from step 2.** Always correct, at the cost of
   losing any other change made to the database since.
2. **`--revert` the manifest**, to undo only what this migration wrote,
   leaving everything else (including work done since) alone:

   ```bash
   npm run migrate:legacy-clients -- --revert legacy-migration-manifest.json
   ```

   This resets each column only if it still holds the value the migration
   wrote (a value a user has since changed by hand is left alone), and
   removes the contacts the migration created.

## MySQL

The store is Prisma-only (no raw SQL), so the same code runs against
`schema.mysql.prisma` on the Hostinger MySQL target. Rehearse the same
dry run → review → apply sequence against a MySQL copy of production before
running it there for real (see Slice 15's migration rehearsal).
