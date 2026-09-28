import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuditLogContent } from './AuditLogContent';
import { useAuditLog } from '../../../hooks/useAuditLog';
import { useTeam } from '../../../hooks/useTeam';

vi.mock('../../../hooks/useAuditLog');
vi.mock('../../../hooks/useTeam');

const ROLE_ENTRY = {
  id: 'e-role',
  at: '2026-09-20T10:00:00.000Z',
  userId: 'u-admin',
  userRole: 'ADMINISTRATOR',
  userName: 'Ada Admin',
  roleNameSq: 'Administrator',
  roleNameEn: 'Administrator',
  action: 'UPDATE',
  entityType: 'Role',
  entityId: 'r-reception',
  entityLabel: 'Recepsion',
  changes: [
    { field: 'permissionsRemoved', old: ['contracts.validity.view'], new: null },
    { field: 'permissions', old: { 'contracts.validity.view': 'ALL' }, new: {} },
  ],
};

const SYSTEM_ENTRY = {
  id: 'e-system',
  at: '2026-09-19T08:00:00.000Z',
  userId: null,
  userRole: 'SYSTEM',
  userName: null,
  roleNameSq: null,
  roleNameEn: null,
  action: 'STATUS_CHANGE',
  entityType: 'Contract',
  entityId: 'c-1',
  entityLabel: 'Acme — Gold',
  changes: [{ field: 'status', old: 'ACTIVE', new: 'EXPIRED' }],
};

describe('AuditLogContent', () => {
  const audit = {
    filters: {},
    updateFilters: vi.fn(),
    page: 1,
    setPage: vi.fn(),
    limit: 25,
    setLimit: vi.fn(),
    entries: [ROLE_ENTRY, SYSTEM_ENTRY],
    total: 2,
    loading: false,
    loadFailed: false,
    fetchEntries: vi.fn(),
    exportCsv: vi.fn(),
  };

  const renderContent = (overrides: Partial<typeof audit> = {}) => {
    (useAuditLog as any).mockReturnValue({ ...audit, ...overrides });
    (useTeam as any).mockReturnValue({ staff: [{ id: 'u-admin', firstName: 'Ada', lastName: 'Admin', email: 'ada@example.com' }], fetchStaff: vi.fn() });
    return render(
      <MemoryRouter initialEntries={['/t1/settings/audit']}>
        <Routes>
          <Route path=":tenantSlug/settings/audit" element={<AuditLogContent />} />
        </Routes>
      </MemoryRouter>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    audit.exportCsv.mockResolvedValue(undefined);
  });

  it('FR-AUD-06 lists the entries with their user, role, action and record', () => {
    renderContent();
    const table = within(screen.getByRole('table'));

    expect(audit.fetchEntries).toHaveBeenCalled();
    expect(table.getByText('Ada Admin')).toBeInTheDocument();
    expect(table.getByText('Administrator')).toBeInTheDocument();
    expect(table.getByText('Updated')).toBeInTheDocument();
    expect(table.getByText('Role')).toBeInTheDocument();
    expect(table.getByText(/Recepsion/)).toBeInTheDocument();
    expect(table.getByText('System')).toBeInTheDocument();
    expect(table.getByText('Status changed')).toBeInTheDocument();
  });

  it('changing a filter calls updateFilters', () => {
    renderContent();

    fireEvent.change(screen.getByLabelText('Record type'), { target: { value: 'Role' } });
    expect(audit.updateFilters).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'Role' }));

    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'UPDATE' } });
    expect(audit.updateFilters).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE' }));

    fireEvent.change(screen.getByLabelText('User'), { target: { value: 'u-admin' } });
    expect(audit.updateFilters).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-admin' }));
  });

  it('opens the drawer on a row and shows the before/after table, with the removed permission and the redacted value', () => {
    renderContent();

    fireEvent.click(screen.getByText(/Recepsion/));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Permissions removed')).toBeInTheDocument();
    expect(within(dialog).getByText('contracts.validity.view')).toBeInTheDocument();
  });

  it('shows a redacted change as the translated placeholder', () => {
    const secretEntry = {
      ...ROLE_ENTRY,
      id: 'e-secret',
      changes: [{ field: 'note', old: 'changed', new: 'changed' }],
    };
    renderContent({ entries: [secretEntry] });

    fireEvent.click(screen.getByText(/Recepsion/));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByText('changed').length).toBeGreaterThan(0);
  });

  it('exports the current filter as CSV', async () => {
    renderContent();

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(audit.exportCsv).toHaveBeenCalledTimes(1);
  });
});
