import React from 'react';
import { MembershipShell } from './MembershipShell';
import { MemberPaymentsContent } from './MemberPaymentsContent';

export const MemberPaymentsPage: React.FC = () => (
  <MembershipShell>
    <MemberPaymentsContent />
  </MembershipShell>
);
