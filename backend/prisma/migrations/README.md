# Migrations

MySQL only. `migration_lock.toml` pins the provider, and Prisma refuses to run
this history against any other engine.

## Why there is a single `0_init`

The history used to be 17 Postgres migrations emitting `JSONB`, `TIMESTAMP(3)`
and double-quoted identifiers. None of that runs on MySQL, and production had
never been built from it anyway — the Hostinger database was provisioned from
`prisma/nevacrm_full_import.sql` by hand.

So the history was replaced with one squashed MySQL baseline generated from the
schema:

```
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

The Postgres originals are not lost — they are in git history, before the
MySQL migration commit.

`0_init` reproduces the production schema exactly: it creates the same 28
application tables as `nevacrm_full_import.sql`, which was diffed table-for-table
when the baseline was generated.

## One-time reconciliation on production

**Do this before the first `prisma migrate` command ever runs against
production.** The live `_prisma_migrations` table still records the 16 old
Postgres migration names as applied. Prisma compares that table against this
folder, so left alone it will report every one of them as a missing applied
migration and refuse to proceed.

Replace those rows with a single row for the baseline:

```sql
-- Back up first. This rewrites migration bookkeeping, not data.
DELETE FROM `_prisma_migrations`;

INSERT INTO `_prisma_migrations`
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES
  (UUID(), '<checksum-of-0_init/migration.sql>', NOW(3), '0_init', NULL, NULL, NOW(3), 1);
```

Prisma's own equivalent, which computes the checksum for you, is:

```
npx prisma migrate resolve --applied 0_init
```

Prefer that when you can reach the database from a machine with the CLI. It does
not clear the 16 stale rows, though — run the `DELETE` above first either way.

## Hostinger cannot run `migrate deploy`

Hostinger's shared-hosting database user is denied access to `information_schema`
entirely. Prisma Migrate needs it to introspect, so `prisma migrate deploy`
cannot work there regardless of the bookkeeping above — that is why
`scratch/hostinger_catchup.sql` exists and is written with `CREATE TABLE IF NOT
EXISTS` / `ADD COLUMN IF NOT EXISTS`, which MySQL resolves internally without
touching `information_schema`.

In practice:

- **Local and CI** — `prisma migrate deploy` against a normal MySQL. This folder
  is the source of truth.
- **Hostinger production** — hand-written idempotent SQL in `scratch/`, applied
  through phpMyAdmin. Keep it in step with any migration added here, and take
  the phpMyAdmin export backup first.
