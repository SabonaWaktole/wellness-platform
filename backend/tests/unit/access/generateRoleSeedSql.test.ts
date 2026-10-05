import * as fs from 'fs';
import * as path from 'path';
import {
  generateMysqlPermissionUpgradeSql,
  generateMysqlRoleSeedSql,
  generatePostgresPermissionUpgradeSql,
  generatePostgresRoleSeedSql,
} from '../../../scripts/generate-role-seed-sql';

/** The text between (and including) the generated-block markers in `filePath`. */
function generatedBlockOf(filePath: string, BEGIN = '-- BEGIN GENERATED ROLE SEED', END = '-- END GENERATED ROLE SEED'): string {
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

  describe('FR-RBAC-16 the m2-sales permission upgrade', () => {
    const upgradeBlockOf = (filePath: string) =>
      generatedBlockOf(
        filePath,
        '-- BEGIN GENERATED PERMISSION UPGRADE m2-sales',
        '-- END GENERATED PERMISSION UPGRADE m2-sales'
      );

    it('the Postgres migration carries exactly what the generator produces today', () => {
      const migration = path.join(__dirname, '../../../prisma/migrations/20260930180000_m2_sales_permissions/migration.sql');
      expect(upgradeBlockOf(migration)).toBe(generatePostgresPermissionUpgradeSql('m2-sales'));
    });

    it('the MySQL script and the combined MySQL upgrade carry exactly what the generator produces today', () => {
      const standalone = path.join(__dirname, '../../../prisma/mysql_migration_m2_sales_permissions.sql');
      const combined = path.join(__dirname, '../../../prisma/mysql_upgrade_to_current.sql');
      expect(upgradeBlockOf(standalone)).toBe(generateMysqlPermissionUpgradeSql('m2-sales'));
      expect(upgradeBlockOf(combined)).toBe(generateMysqlPermissionUpgradeSql('m2-sales'));
    });
  });

  describe('FR-RBAC-20 the m3-contracts-payments permission upgrade', () => {
    const upgradeBlockOf = (filePath: string) =>
      generatedBlockOf(
        filePath,
        '-- BEGIN GENERATED PERMISSION UPGRADE m3-contracts-payments',
        '-- END GENERATED PERMISSION UPGRADE m3-contracts-payments'
      );

    it('the Postgres migration carries exactly what the generator produces today', () => {
      const migration = path.join(__dirname, '../../../prisma/migrations/20261008100000_m3_contracts_permissions/migration.sql');
      expect(upgradeBlockOf(migration)).toBe(generatePostgresPermissionUpgradeSql('m3-contracts-payments'));
    });

    it('the MySQL script and the combined MySQL upgrade carry exactly what the generator produces today', () => {
      const standalone = path.join(__dirname, '../../../prisma/mysql_migration_m3_contracts_permissions.sql');
      const combined = path.join(__dirname, '../../../prisma/mysql_upgrade_to_current.sql');
      expect(upgradeBlockOf(standalone)).toBe(generateMysqlPermissionUpgradeSql('m3-contracts-payments'));
      expect(upgradeBlockOf(combined)).toBe(generateMysqlPermissionUpgradeSql('m3-contracts-payments'));
    });
  });
});
