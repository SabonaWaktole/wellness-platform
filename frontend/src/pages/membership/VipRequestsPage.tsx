import React from 'react';
import { MembershipShell } from './MembershipShell';
import { VipRequestsContent } from './VipRequestsContent';

export const VipRequestsPage: React.FC = () => (
  <MembershipShell>
    <VipRequestsContent />
  </MembershipShell>
);
