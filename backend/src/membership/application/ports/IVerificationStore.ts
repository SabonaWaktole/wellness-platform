import type { IdentityChoice, VerificationChannel, VerificationResult } from '../../domain/verification';

export interface NewVerificationEvent {
  tenantId: string;
  memberId: string | null;
  channel: VerificationChannel;
  userId: string | null;
  result: VerificationResult;
  ipHash: string | null;
}

export interface VerificationEventRecord {
  id: string;
  memberId: string | null;
  channel: VerificationChannel;
  userId: string | null;
  result: VerificationResult;
  identityChoice: IdentityChoice;
  createdAt: Date;
}

/** The verification log (M4 Slice 13, FR-VER-06). Its own table, not the audit log. */
export interface IVerificationStore {
  record(event: NewVerificationEvent): Promise<string>;
  /** Sets the identity choice of one event of this user in this workspace; false when there is none (FR-VER-03). */
  setIdentity(tenantId: string, id: string, userId: string, choice: IdentityChoice): Promise<boolean>;
  /** Newest first, at most `limit`. */
  listForMember(tenantId: string, memberId: string, limit: number): Promise<VerificationEventRecord[]>;
}
