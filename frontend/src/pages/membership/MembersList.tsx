import React from 'react';
import { MembershipShell } from './MembershipShell';
import { MembersContent } from './MembersContent';

export const MembersList: React.FC = () => (
  <MembershipShell>
    <MembersContent />
  </MembershipShell>
);
