import React from 'react';
import { MembershipShell } from './MembershipShell';
import { MemberDetailContent } from './MemberDetailContent';

export const MemberDetailPage: React.FC = () => (
  <MembershipShell>
    <MemberDetailContent />
  </MembershipShell>
);
