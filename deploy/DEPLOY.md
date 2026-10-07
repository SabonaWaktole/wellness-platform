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

`mysql_upgrade_to_current.sql` replaces the seventeen older hand-written
`mysql_*migration*.sql` files it lists in its header — do not run those as
well. Every statement in it
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
npm ci                     # full install — the build needs devDependencies
npm run build              # generates the Prisma client, then compiles
npm prune --omit=dev       # now safe to drop dev-only packages
npm start                  # node dist/main/server.js
```

**Do not `npm ci --omit=dev` before the build.** `typescript`, `prisma`,
`tsc-alias`, `tsconfig-paths` and every `@types/*` package `tsc` needs to
compile are devDependencies — installing without them makes `npm run build`
fail with a wall of `TS7016: Could not find a declaration file` errors.
`npm run build` needs them; the running server (`node dist/main/server.js`)
does not, which is what `npm prune --omit=dev` is for, run only after the
build has already produced `dist/`.

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
NODE_ENV="production"
DATABASE_URL="mysql://user:password@host:3306/dbname"
JWT_SECRET="<a long random string, at least 32 characters>"
JWT_EXPIRATION="24h"
FRONTEND_URL="https://<the frontend's own origin>"
PUBLIC_BASE_URL="https://<the address printed on member cards>"
```

- **`NODE_ENV=production` is not optional**, on staging as much as on
  production. It is what makes the session cookie `Secure; SameSite=None`
  (`src/main/interfaces/http/authCookie.ts`) and what stops CORS from accepting
  `http://localhost:*` origins (`src/main/app.ts`). A staging server without it
  sends its session cookie over plain HTTP.
- **`FRONTEND_URL`** is the only origin CORS lets call the API with
  credentials. It must match exactly, scheme included.
- **`PUBLIC_BASE_URL`** (Wellness+, NFR-OPS-05) is the one address that member
  card links and QR codes are built from. In production the server **refuses to
  start without it**: an `https://` origin with no trailing slash and no path.
  Fix it before the first card is issued; if it ever changes, redirect the old
  address to the new one in the host's configuration so issued cards keep
  working.
- **`CARD_RATE_LIMIT_PER_HOUR`** (optional, Wellness+, NFR-SEC-08) is how many
  requests one IP address may make to the public card page per hour. The default
  is 60. The card page is `/m/<token>` on the public address and the QR holds
  `/v/<token>`; both are served by the frontend and need the same single-page
  fallback as every other frontend route.
- **`JWT_EXPIRATION`** defaults to `24h`. There is no refresh token, so this is
  also the longest a stolen token stays usable; deactivation and suspension are
  enforced on every request regardless.
- `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MS` are for tests only. Leave
  them unset: the default is 10 attempts per 15 minutes per IP.

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

---

## 4. Staging (Milestone 1 UAT)

Staging is a second Hostinger site with its own MySQL database, set up exactly
as sections 1–3 describe; nothing about it differs from production except the
data. See `deploy/hosting-and-data-protection.md` for where it is hosted and
`deploy/uat-milestone-1.md` for the UAT run itself.

1. **HTTPS.** In hPanel, install the SSL certificate and turn on *Force HTTPS*
   for both the frontend and the API domains. `frontend/public/.htaccess` also
   redirects HTTP → HTTPS and sends `Strict-Transport-Security`; the API sends
   its own through helmet. Check both:

   ```bash
   curl -sI http://<frontend-domain>/ | grep -i '^location'        # → https://…
   curl -sI https://<frontend-domain>/ | grep -i strict-transport  # present
   curl -sI https://<api-domain>/api/auth/me | grep -i strict-transport
   ```

2. **Environment**, as in section 2, with `NODE_ENV=production`.
3. **Database**: baseline + `mysql_upgrade_to_current.sql`, then provision the
   workspace and the UAT users and data:

   ```bash
   cd backend
   npm run seed:wellness -- --owner-email <admin email> --owner-password <pw>
   npm run seed:uat -- --password <pw for the UAT users>
   ```

4. **Performance**: `npm run perf:staging` (see `deploy/uat-milestone-1.md`).

---

## What was verified before packaging

Against MySQL 8.0 in a throwaway container, using the real archive contents:

- baseline import → `migrate diff` lists the full set of missing objects;
- baseline + upgrade → **`No difference detected.`** against
  `schema.mysql.prisma`;
- the upgrade run a second time → only `skip:` notices, still no difference;
- live Prisma round-trip on the upgraded database: a v3 form document written to
  and read back from the `ClientForm.layout` JSON column with section geometry
  intact, plus `FormVersion`, `FormSubmission`, a nullable-name/status `Client`
  with `notes`, and a `CustomFieldDefinition` carrying `role`/`order`/`required`
  and a JSON `options` array;
- `frontend`: `tsc -b && vite build` clean;
- `frontend` unit suites: 385 passing.

**Re-verified end to end** (2026-09-13, PR #83's changes), unpacking the actual
built archives rather than the source tree:

- `npm ci` (full, not `--omit=dev`) → `npm run build` → `npm prune --omit=dev`
  → `node dist/main/server.js` against the upgraded MySQL container: boots,
  and `GET /api/:tenantSlug/forms/default` with a minted JWT returns a real
  form read live through Prisma;
- the new style properties this PR added (`titleStyles.background`,
  `styles.fieldLayout`, `styles.optionColumns`, `styles.density`) round-trip
  through `ClientForm.layout` on MySQL intact;
- `frontend`: `npm ci` → `npm run build` from the unpacked archive succeeds
  (`tsc -b && vite build`), `dist/` fully formed;
- `deploy/package.py`'s own archive contents checked directly: no `.env`, no
  `node_modules`, no `*.test.*`, `backend/prisma/mysql_upgrade_to_current.sql`
  present.

**Re-verified** (2026-09-30, Milestone 1 Slice 15) after the Slice 2–14 schema
changes: baseline → upgrade → upgrade again → `No difference detected.` against
`schema.mysql.prisma`, with no `STILL MISSING` row. The `mysql` job in
`.github/workflows/ci.yml` now repeats exactly this on every push, so it can no
longer drift unnoticed.

## Rebuilding the archives

```bash
python3 deploy/package.py
```
