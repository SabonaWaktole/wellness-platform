import { AccessContext } from '../../../access/domain/AccessContext';
import { IUserRepository } from '../../domain/repositories/IUserRepository';
import { UnauthorizedError } from '../../domain/errors';

export interface UpdateUserProfileInput {
  userId: string;
  requestingUserId: string;
  access: AccessContext;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string;
  /**
   * `null` clears the override and returns the user to the workspace default.
   * `undefined` leaves it untouched — the two are not interchangeable here.
   */
  language?: string | null;
}

export class UpdateUserProfileUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute(input: UpdateUserProfileInput): Promise<void> {
    // 1. Verify user exists
    const userToUpdate = await this.userRepository.findById(input.userId);
    if (!userToUpdate) {
      throw new Error('User not found');
    }

    // 2. Authorization checks
    // Users can only update their own profile
    if (input.userId !== input.requestingUserId) {
      throw new UnauthorizedError('You can only update your own profile');
    }

    // Email change restriction: an account's email is an identity the
    // workspace administers, so changing it takes users.manage.
    if (input.email && input.email !== userToUpdate.email) {
      input.access.ensure('users.manage');

      // If they are changing their email, ensure the new email is not already taken
      const existingUser = await this.userRepository.findAnyByEmail(input.email);
      if (existingUser) {
        throw new Error('Email is already in use');
      }
    }

    // 3. Perform update
    const updateData: any = {};
    if (input.firstName !== undefined) updateData.firstName = input.firstName;
    if (input.lastName !== undefined) updateData.lastName = input.lastName;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.language !== undefined) updateData.language = input.language;

    await this.userRepository.updateProfile(input.userId, updateData);
  }
}
