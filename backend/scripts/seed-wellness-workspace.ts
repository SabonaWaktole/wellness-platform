/**
 * Seeds the Wellness Albania workspace with its regional defaults (FR-LNG-04):
 * Albanian interface, sq-AL formatting, Europe/Tirane, DD.MM.YYYY and EUR.
 *
 * Runs through ProvisionWellnessWorkspaceUseCase, so the workspace is created
 * by the same code the platform console uses. Works against PostgreSQL and
 * MySQL alike: it only goes through Prisma, whichever schema generated it.
 *
 * Usage:
 *   npm run seed:wellness -- --owner-email admin@example.al --owner-password 'S3cure!pass'
 *       Creates the workspace and its first Administrator. The same values can
 *       come from WELLNESS_OWNER_EMAIL / WELLNESS_OWNER_PASSWORD instead.
 *
 *   npm run seed:wellness -- --update-existing
 *       The workspace already exists (made from the platform console, say):
 *       moves it onto the Albanian defaults. Without the flag an existing
 *       workspace is reported and left alone, so a second run is harmless.
 *
 * There is deliberately no default password.
 */
import { prisma } from '../src/shared/infrastructure/prisma/client';
import { PrismaPlatformSettingsRepository } from '../src/settings/infrastructure/PrismaPlatformSettingsRepository';
import { PrismaTenantRepository } from '../src/tenant/infrastructure/repositories/PrismaTenantRepository';
import { PrismaTenantProvisioningTransaction } from '../src/tenant/infrastructure/PrismaTenantProvisioningTransaction';
import { BcryptPasswordHasher } from '../src/auth/infrastructure/BcryptPasswordHasher';
import { CreateTenantWithOwnerUseCase } from '../src/tenant/application/use-cases/CreateTenantWithOwnerUseCase';
import { ProvisionWellnessWorkspaceUseCase } from '../src/tenant/application/use-cases/ProvisionWellnessWorkspaceUseCase';
import { ALBANIA_WORKSPACE_DEFAULTS, WELLNESS_WORKSPACE } from '../src/tenant/domain/wellnessWorkspace';

const argOf = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

async function main() {
  const email = argOf('owner-email') ?? process.env.WELLNESS_OWNER_EMAIL;
  const password = argOf('owner-password') ?? process.env.WELLNESS_OWNER_PASSWORD;

  const platformSettings = new PrismaPlatformSettingsRepository();
  const useCase = new ProvisionWellnessWorkspaceUseCase(
    platformSettings,
    new PrismaTenantRepository(),
    new CreateTenantWithOwnerUseCase(
      new PrismaTenantProvisioningTransaction(),
      new BcryptPasswordHasher(),
      platformSettings
    )
  );

  const result = await useCase.execute({
    owner: email && password ? { email, password } : undefined,
    updateExisting: process.argv.includes('--update-existing'),
  });

  const defaults = Object.entries(ALBANIA_WORKSPACE_DEFAULTS)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');

  console.log(`${WELLNESS_WORKSPACE.name} runs the sales process: offers are made from deals, with no quotation email or public link.`);
  switch (result.outcome) {
    case 'created':
      console.log(`Created ${WELLNESS_WORKSPACE.name} (/${WELLNESS_WORKSPACE.urlSlug}, id ${result.tenantId}) with ${defaults}.`);
      console.log(`${email} can now sign in at /login as its Administrator.`);
      break;
    case 'updated':
      console.log(`Moved ${WELLNESS_WORKSPACE.name} (id ${result.tenantId}) onto ${defaults}.`);
      break;
    case 'unchanged':
      console.log(`${WELLNESS_WORKSPACE.name} already exists (id ${result.tenantId}); its settings are unchanged.`);
      console.log('Pass --update-existing to move it onto the Albanian defaults.');
      break;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
