import React from 'react';
import { MembershipShell } from './MembershipShell';
import { MemberFormContent } from './MemberFormContent';

export const MemberFormPage: React.FC = () => (
  <MembershipShell>
    <MemberFormContent />
  </MembershipShell>
);
