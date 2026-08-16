import { ITenantProvisioningTransaction } from '../ports/ITenantProvisioningTransaction';
import { IPasswordHasher } from '../../../auth/application/ports/IPasswordHasher';
import { UserRole } from '../../../auth/domain/enums/UserRole';
import { Email } from '../../../auth/domain/value-objects/Email';
import { Password } from '../../../auth/domain/value-objects/Password';
import { SlugAlreadyTakenError } from '../../../auth/domain/errors';
import { Tenant } from '../../domain/entities/Tenant';
import { User } from '../../../auth/domain/entities/User';
import { IPlatformSettingsRepository } from '../../../settings/domain/IPlatformSettingsRepository';
import { v4 as uuidv4 } from 'uuid';

export interface CreateTenantWithOwnerDTO {
  companyName: string;
  urlSlug: string;
  ownerEmail: string;
  ownerPassword: string;
}

/**
 * Creates a workspace and its first BUSINESS_OWNER as one atomic unit.
 *
 * **One implementation, two callers.** Both the public self-registration flow
 * (`RegisterBusinessOwnerUseCase`, unauthenticated and rate-limited) and the
 * Super Admin console (`POST /api/tenants`) provision a workspace, and they
 * must produce byte-for-byte the same result — a tenant plus an owner who can
 * log into it. Those are two different sets of *pre-conditions* (who may call,
 * where the password comes from, what comes back), not two different pieces of
 * domain logic. Duplicating the logic would mean a future fix to one path
 * silently not reaching the other, which is how the admin path would inherit
 * exactly the atomicity gap this use case exists to close.
 *
 * Everything policy-shaped therefore stays with the callers: authentication,
 * rate limiting, role gating, and what shape the response takes.
 */
export class CreateTenantWithOwnerUseCase {
  constructor(
    private readonly provisioningTx: ITenantProvisioningTransaction,
    private readonly passwordHasher: IPasswordHasher,
    /**
     * Optional so every existing test double that constructs this use case
     * with two arguments keeps compiling. Absent, it behaves exactly as before
     * this feature existed: `Tenant.create()`'s own hardcoded defaults
     * (`DEFAULT_CURRENCY`, `DEFAULT_LOCALE`, ...) apply, unchanged.
     */
    private readonly platformSettingsRepository?: IPlatformSettingsRepository
  ) {}

  async execute(dto: CreateTenantWithOwnerDTO): Promise<{ tenant: Tenant; user: User }> {
    // Value objects validate before anything is written or hashed. Both are
    // constructed for their validation side effect on the raw input.
    const email = new Email(dto.ownerEmail);
    const password = new Password(dto.ownerPassword);

    // Hashing is deliberately OUTSIDE the transaction. bcrypt takes ~100ms;
    // doing it inside would hold a database connection and an open transaction
    // for that whole time, on a route reachable by unauthenticated callers.
    const hashedPassword = await this.passwordHasher.hash(password.value);

    /*
     * Read OUTSIDE the transaction too, for the same reason: this is a single
     * SELECT against a row nothing else in this flow writes to, so holding it
     * does the transaction no favours. `get()` never throws — a platform that
     * has never saved this row gets `PlatformSettings.defaults()`, which is
     * numerically identical to `Tenant.create()`'s own hardcoded defaults. A
     * new workspace's settings are therefore never blocked on this row
     * existing.
     */
    const platformDefaults = await this.platformSettingsRepository?.get();

    try {
      return await this.provisioningTx.run(async ({ tenantRepo, userRepo }) => {
        /*
         * The slug check runs INSIDE the transaction, unlike the original,
         * which checked before opening one. That does not by itself make the
         * check race-free — two concurrent transactions can both read "free"
         * under Postgres' default READ COMMITTED — but the unique index on
         * urlSlug is the actual guarantee, and the catch below turns the
         * resulting constraint violation into the same domain error. So the
         * loser of a race now gets `SlugAlreadyTakenError` rather than a raw
         * Prisma error surfaced as an opaque 400.
         */
        const existingTenant = await tenantRepo.findBySlug(dto.urlSlug);
        if (existingTenant) {
          throw new SlugAlreadyTakenError(dto.urlSlug);
        }

        const tenant = Tenant.create({
          id: uuidv4(),
          name: dto.companyName,
          urlSlug: dto.urlSlug,
          createdAt: new Date(),
          // subscriptionStatus is left to default. A newly provisioned
          // workspace is ACTIVE — including one an admin creates, since the
          // point of creating it is that someone is going to use it.
          //
          // Everything below is the platform's CURRENT default at the moment
          // of creation, captured once here. Changing the platform default
          // afterward does not reach back and move this tenant — see the
          // schema comment on PlatformSettings.
          requiresQuotationApproval: platformDefaults?.requiresQuotationApproval,
          currency: platformDefaults?.currency,
          locale: platformDefaults?.locale,
          timezone: platformDefaults?.timezone,
          dateFormat: platformDefaults?.dateFormat,
          defaultLanguage: platformDefaults?.defaultLanguage,
        });
        await tenantRepo.create(tenant);

        const user = User.create({
          id: uuidv4(),
          email: email.value,
          hashedPassword,
          role: UserRole.BUSINESS_OWNER,
          tenantId: tenant.id,
          createdAt: new Date(),
        });
        await userRepo.create(user);

        return { tenant, user };
      });
    } catch (error: any) {
      // P2002 is Prisma's unique-constraint violation. Reaching it means the
      // in-transaction check above lost a race; the outcome for the caller is
      // identical either way, so the error they see should be too.
      if (error?.code === 'P2002') {
        throw new SlugAlreadyTakenError(dto.urlSlug);
      }
      throw error;
    }
  }
}
