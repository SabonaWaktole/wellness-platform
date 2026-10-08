import React from 'react';
import { MembershipShell } from './MembershipShell';
import { EmployeeUploadContent } from './EmployeeUploadContent';

export const EmployeeUploadPage: React.FC = () => (
  <MembershipShell>
    <EmployeeUploadContent />
  </MembershipShell>
);
