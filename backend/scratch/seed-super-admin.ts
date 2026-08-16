/**
 * Seeds the platform SUPER_ADMIN.
 *
 * There is no way to create this account through the application: registration
 * only ever produces a tenant plus its first BUSINESS_OWNER, and
 * `CreateUserUseCase` explicitly refuses to mint another SUPER_ADMIN. The role
 * exists outside every workspace (`tenantId IS NULL`), so it has no owner who
 * could be trusted to grant it. It is seeded here and nowhere else.
 *
 * Idempotent: re-running it resets the password of the existing account rather
 * than creating a second one. `User.email` carries no unique constraint
 * anywhere in the schema, so nothing at the database level would stop a
 * duplicate — this check is the only thing that does.
 *
 * Usage:
 *   npm run seed:superadmin
 *   npm run seed:superadmin -- --email a@b.com --password 'S3cret!x'
 *   npm run seed:superadmin -- --sql-only      # print SQL, touch nothing
 */
import { randomUUID } from 'crypto';
import { prisma } from '../src/shared/infrastructure/prisma/client';
import { BcryptPasswordHasher } from '../src/auth/infrastructure/BcryptPasswordHasher';
import { User } from '../src/auth/domain/entities/User';
import { UserRole } from '../src/auth/domain/enums/UserRole';

const DEFAULT_EMAIL = 'sebonawaktole@gmail.com';
const DEFAULT_PASSWORD = 'S@b0n@W@';

const argOf = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

/** Single-quoted SQL literal. Only ever applied to values we generate. */
const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

async function main() {
  const email = argOf('email') ?? process.env.SUPER_ADMIN_EMAIL ?? DEFAULT_EMAIL;
  const password = argOf('password') ?? process.env.SUPER_ADMIN_PASSWORD ?? DEFAULT_PASSWORD;
  const sqlOnly = process.argv.includes('--sql-only');

  const hashedPassword = await new BcryptPasswordHasher().hash(password);

  const existing = await prisma.user.findFirst({
    where: { email, role: UserRole.SUPER_ADMIN },
    select: { id: true },
  });

  // Built through the entity rather than handed straight to Prisma so the
  // "SUPER_ADMIN must not be associated with a tenant" invariant is enforced
  // here too, not just on the request path.
  const user = User.create({
    id: existing?.id ?? randomUUID(),
    email,
    hashedPassword,
    firstName: 'Platform',
    lastName: 'Admin',
    role: UserRole.SUPER_ADMIN,
    tenantId: null,
    createdAt: new Date(),
  });

  // PostgreSQL dialect, matching prisma/schema.prisma: double-quoted
  // identifiers for the camelCase columns Prisma creates, and a real boolean
  // rather than MySQL's 1.
  const sql = existing
    ? `UPDATE "User" SET "hashedPassword" = ${q(hashedPassword)}, "isActive" = true WHERE "id" = ${q(user.id)};`
    : `INSERT INTO "User" ("id", "email", "hashedPassword", "firstName", "lastName", "role", "tenantId", "isActive", "createdAt")\n` +
      `VALUES (${q(user.id)}, ${q(user.email)}, ${q(hashedPassword)}, 'Platform', 'Admin', 'SUPER_ADMIN', NULL, true, NOW());`;

  // Printed either way, so the same account can be provisioned by pasting into
  // a hosting provider's SQL console when running this script against the
  // remote database is inconvenient.
  console.log('\n-- SQL equivalent --\n' + sql + '\n');

  if (sqlOnly) {
    console.log('--sql-only: database not modified.');
    return;
  }

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { hashedPassword, isActive: true },
    });
    console.log(`Super admin already existed — password reset for ${email} (id ${existing.id}).`);
  } else {
    await prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        hashedPassword: user.hashedPassword,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: null,
        createdAt: user.createdAt,
      },
    });
    console.log(`Super admin created: ${email} (id ${user.id}).`);
  }

  console.log('Log in at /login with no workspace slug.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
