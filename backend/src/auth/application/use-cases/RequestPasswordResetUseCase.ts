import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IPasswordResetTokenRepository } from '../../domain/repositories/IPasswordResetTokenRepository';
import { IEmailSender } from '../ports/IEmailSender';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { PasswordResetToken } from '../../domain/entities/PasswordResetToken';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

export class RequestPasswordResetUseCase {
  constructor(
    private userRepository: IUserRepository,
    private prtRepository: IPasswordResetTokenRepository,
    private emailSender: IEmailSender,
    private tenantRepository: ITenantRepository
  ) {}

  async execute(input: any) {
    const user = input.tenantId
      ? await this.userRepository.findByEmail(input.email, input.tenantId)
      : await this.userRepository.findAnyByEmail(input.email);
    if (!user) return; // Silent fail

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const prt = PasswordResetToken.create({
      id: uuidv4(),
      userId: user.id,
      token,
      expiresAt,
      usedAt: null,
    });

    await this.prtRepository.create(prt);
    const language = await this.languageOf(user.language, user.tenantId);
    this.emailSender.sendPasswordResetEmail(user.email, token, language).catch((err) => {
      console.error('Failed to send password reset email in background:', err);
    });
  }

  /**
   * FR-USR-01: the user's own language, else their workspace's default. A
   * platform administrator has neither, and the platform console is English.
   */
  private async languageOf(userLanguage: string | null, tenantId: string | null): Promise<string> {
    if (userLanguage) return userLanguage;
    if (!tenantId) return 'en';
    const tenant = await this.tenantRepository.findById(tenantId);
    return tenant?.defaultLanguage ?? 'en';
  }
}
