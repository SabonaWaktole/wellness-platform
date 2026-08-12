import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { IPasswordResetTokenRepository } from '../../domain/repositories/IPasswordResetTokenRepository';
import { IEmailSender } from '../ports/IEmailSender';
import { PasswordResetToken } from '../../domain/entities/PasswordResetToken';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

export class RequestPasswordResetUseCase {
  constructor(
    private userRepository: IUserRepository,
    private prtRepository: IPasswordResetTokenRepository,
    private emailSender: IEmailSender
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
    this.emailSender.sendPasswordResetEmail(user.email, token).catch((err) => {
      console.error('Failed to send password reset email in background:', err);
    });
  }
}
