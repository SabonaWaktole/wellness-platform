// `prisma generate` bakes the datasource provider into the generated client
// at generate time — it does not read `DATABASE_URL`'s protocol at runtime.
// Local dev and Render both run Postgres against `schema.prisma`; Hostinger
// runs MySQL and must generate from `schema.mysql.prisma` instead, or the
// deployed client rejects the mysql:// connection string outright. This
// picks the right one from the `DATABASE_URL` that's actually configured for
// the environment doing the build, so `npm run build` is correct everywhere
// without the deploy target having to remember a different command.
const { execSync } = require('child_process');

const url = process.env.DATABASE_URL || '';
const schema = url.startsWith('mysql://')
  ? 'prisma/schema.mysql.prisma'
  : 'prisma/schema.prisma';

console.log(`[generate-prisma-client] DATABASE_URL protocol -> using ${schema}`);
execSync(`npx prisma generate --schema=${schema}`, { stdio: 'inherit' });
