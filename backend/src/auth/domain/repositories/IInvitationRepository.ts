import { Invitation } from '../entities/Invitation';

export interface IInvitationRepository {
  create(invitation: Invitation): Promise<Invitation>;
  findByToken(token: string): Promise<Invitation | null>;
  findByTenantId(tenantId: string | null): Promise<Invitation[]>;
  markAccepted(id: string, acceptedAt: Date): Promise<void>;
  delete(id: string): Promise<void>;
}
