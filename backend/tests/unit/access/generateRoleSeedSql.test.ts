import * as fs from 'fs';
import * as path from 'path';
import { generateMysqlRoleSeedSql, generatePostgresRoleSeedSql } from '../../../scripts/generate-role-seed-sql';

const BEGIN = '-- BEGIN GENERATED ROLE SEED';
const END = '-- END GENERATED ROLE SEED';

/** The text between (and including) the generated-block markers in `filePath`. */
function generatedBlockOf(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf8');
  const start = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  if (start === -1 || end === -1) {
    throw new Error(`${filePath} has no ${BEGIN}/${END} markers`);
  }
  return content.slice(start, end + END.length);
}

describe('generate-role-seed-sql (NFR-MNT-01: the matrix and the migration SQL cannot drift apart)', () => {
  it('the Postgres migration carries exactly what the generator produces today', () => {
    const migrationPath = path.join(
      __dirname,
      '../../../prisma/migrations/20260927112507_add_roles_and_permissions/migration.sql'
    );
    expect(generatedBlockOf(migrationPath)).toBe(generatePostgresRoleSeedSql());
  });

  it('the MySQL migration carries exactly what the generator produces today', () => {
    const migrationPath = path.join(__dirname, '../../../prisma/mysql_migration_add_roles_and_permissions.sql');
    expect(generatedBlockOf(migrationPath)).toBe(generateMysqlRoleSeedSql());
  });

  it('the Slice 5 re-seed carries the same blocks, for tenants created after the roles migration', () => {
    const postgres = path.join(__dirname, '../../../prisma/migrations/20260928090000_add_invitation_role/migration.sql');
    const mysql = path.join(__dirname, '../../../prisma/mysql_migration_add_invitation_role.sql');
    expect(generatedBlockOf(postgres)).toBe(generatePostgresRoleSeedSql());
    expect(generatedBlockOf(mysql)).toBe(generateMysqlRoleSeedSql());
  });
});
