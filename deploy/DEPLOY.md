# NevaCRM — deploying the two archives (MySQL)

`nevacrm-backend.zip` and `nevacrm-frontend.zip` each unpack to a single
`backend/` or `frontend/` folder. Neither contains `node_modules`, `.env`, or
anything from `backend/uploads/` — dependencies are installed on the server and
secrets are configured there.

---

## 1. The database comes first

**The MySQL baseline is NOT current.** `prisma/nevacrm_full_import.sql` is the
original Hostinger schema; the code has moved on since. Verified against a real
MySQL 8.0 instance: importing the baseline alone leaves the database missing
`ClientForm`, `FormVersion`, `FormSubmission`, `Client.notes`,
`Client.deletedAt`, `CustomFieldDefinition.role/order/required`, and
`Tenant.clientFieldsSeededAt/clientFormSeededAt`. The app will not run against
it.

So there are always **two** steps, whether the database is brand new or a live
one being upgraded.

```bash
# Back up first. This is what makes "nothing is designed to lose data" a fact
# rather than an intention.
mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

# 1. Fresh database only — skip on an existing one.
mysql -u USER -p DBNAME < backend/prisma/nevacrm_full_import.sql

# 2. Always. Brings any database up to the current schema.
mysql -u USER -p DBNAME < backend/prisma/mysql_upgrade_to_current.sql
```

`mysql_upgrade_to_current.sql` replaces the five older hand-written
`mysql_migration_*.sql` files — do not run those as well. Every statement in it
is guarded against `information_schema`, so it is safe on a fresh baseline, on a
part-migrated database, and on one that is already current; a second run prints
`skip:` for each step and changes nothing.

Do **not** run `prisma migrate deploy` against MySQL. `prisma/migrations/`
is written for PostgreSQL — it emits `JSONB`, `TIMESTAMP(3)` and double-quoted
identifiers, and will fail.

### Verifying the database is right

```bash
cd backend
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.mysql.prisma
```

`No difference detected.` means the database matches what the code expects.
Anything else is the exact list of what is still missing.

---

## 2. Backend

```bash
cd backend
npm ci --omit=dev          # or: npm install --omit=dev
npm run build              # generates the Prisma client, then compiles
npm start                  # node dist/main/server.js
```

`npm run build` picks the Prisma schema from the **protocol of `DATABASE_URL`**
(`scripts/generate-prisma-client.js`): a `mysql://` URL generates from
`schema.mysql.prisma`, anything else from `schema.prisma`. The provider is baked
into the generated client at generate time and is not re-read at runtime, so
`DATABASE_URL` must already be set in the build environment — not just at start.
If it is not, the build silently produces a PostgreSQL client that rejects the
`mysql://` connection string at boot.

`dist/` ships prebuilt, but the build still has to run on the server to generate
the Prisma client for the installed platform.

Required environment (`backend/.env`, which is deliberately not in the archive):

```
DATABASE_URL="mysql://user:password@host:3306/dbname"
JWT_SECRET="<a long random string>"
```

`backend/uploads/` is not in the archive either — customer media belongs on the
server. Create it if this is a fresh install, and make sure the Node process can
write to it.

---

## 3. Frontend

```bash
cd frontend
npm ci
npm run build              # -> dist/
```

Serve `frontend/dist/` as a static site, with an SPA fallback rewriting unknown
paths to `index.html`.

`dist/` ships prebuilt too, **built with no `VITE_API_URL` set**, which resolves
to `/api` — correct when the SPA and the API are served from the same origin
behind a proxy. If the API lives on a different host, that value is compiled
into the bundle and cannot be changed afterwards: set it and rebuild.

```bash
VITE_API_URL="https://api.example.com/api" npm run build
```

(A scheme-less value like `api.example.com/api` is handled — `src/api/baseUrl.ts`
adds `https://` — because some hosting panels strip the scheme.)

---

## What was verified before packaging

Against MySQL 8.0 in a throwaway container, using the real archive contents:

- baseline import → `migrate diff` lists the full set of missing objects;
- baseline + upgrade → **`No difference detected.`** against
  `schema.mysql.prisma`;
- the upgrade run a second time → 30 `skip:` notices, still no difference;
- `npm run build` with a `mysql://` URL → selects `schema.mysql.prisma`,
  compiles clean;
- live Prisma round-trip on the upgraded database: a v3 form document written to
  and read back from the `ClientForm.layout` JSON column with section geometry
  intact, plus `FormVersion`, `FormSubmission`, a nullable-name/status `Client`
  with `notes`, and a `CustomFieldDefinition` carrying `role`/`order`/`required`
  and a JSON `options` array;
- `frontend`: `tsc -b && vite build` clean;
- `frontend` unit suites: 385 passing.

## Rebuilding the archives

```bash
python3 deploy/package.py
```
