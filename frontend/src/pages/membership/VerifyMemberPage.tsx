import React from 'react';
import { MembershipShell } from './MembershipShell';
import { VerifyMemberContent } from './verify/VerifyMemberContent';

export const VerifyMemberPage: React.FC = () => (
  <MembershipShell>
    <VerifyMemberContent />
  </MembershipShell>
);
