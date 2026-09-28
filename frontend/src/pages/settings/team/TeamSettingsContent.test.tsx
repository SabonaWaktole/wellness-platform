import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { TeamSettingsContent } from './TeamSettingsContent';
import { useTeam } from '../../../hooks/useTeam';
import { useAuthStore } from '../../../store/useAuthStore';

vi.mock('../../../hooks/useTeam');
// Stable across renders, as the real hook's useCallback is.
const fetchWarehouses = vi.fn();
vi.mock('../../../hooks/useWarehouses', () => ({
  useWarehouses: () => ({ warehouses: [], fetchWarehouses }),
}));

const ADMIN = { 'users.manage': true, 'companies.view': 'ALL' };
const SALES = { 'companies.view': 'OWN' };

const ROLES = [
  { id: 'r-sales', key: 'SALES_USER', nameSq: 'Përdorues Shitjesh', nameEn: 'Sales User', isSystem: true },
  { id: 'r-reception', key: 'RECEPTION', nameSq: 'Recepsion', nameEn: 'Reception', isSystem: true },
  { id: 'r-admin', key: 'ADMINISTRATOR', nameSq: 'Administrator', nameEn: 'Administrator', isSystem: true },
];

const member = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  email: 'sam@example.com',
  firstName: 'Sam',
  lastName: 'Rep',
  role: 'STAFF',
  roleId: 'r-sales',
  roleKey: 'SALES_USER',
  roleNameSq: 'Përdorues Shitjesh',
  roleNameEn: 'Sales User',
  isActive: true,
  ...overrides,
});
const COLLEAGUE = member({ id: 'c1', email: 'cleo@example.com', firstName: 'Cleo', lastName: 'Seller' });
const RETIRED = member({ id: 'x1', email: 'rex@example.com', firstName: 'Rex', lastName: 'Gone', isActive: false });

const signIn = (permissions: Record<string, string | true>, userId = 'me') =>
  useAuthStore.setState({
    isAuthenticated: true,
    user: { userId, email: 'me@example.com', role: 'STAFF', tenantId: 't1', permissions },
  } as any);

describe('TeamSettingsContent', () => {
  const team = {
    fetchStaff: vi.fn(),
    fetchPendingInvitations: vi.fn(),
    fetchRoles: vi.fn(),
    inviteStaff: vi.fn(),
    updateStaffRole: vi.fn(),
    cancelInvitation: vi.fn(),
    fetchDeactivationImpact: vi.fn(),
    deactivateStaff: vi.fn(),
    reactivateStaff: vi.fn(),
  };

  const renderTeam = (staff: unknown[] = [], pendingInvitations: unknown[] = []) => {
    (useTeam as any).mockReturnValue({ staff, pendingInvitations, loadingStaff: false, loadingInvitations: false, ...team });
    render(<TeamSettingsContent />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    team.fetchRoles.mockResolvedValue(ROLES);
    team.fetchDeactivationImpact.mockResolvedValue({ clients: 0, upcomingAppointments: 0, openContracts: 0, companies: [] });
    team.deactivateStaff.mockResolvedValue(undefined);
    signIn(ADMIN);
  });

  it('renders the members and pending invitations headers', () => {
    renderTeam();

    expect(screen.getByText('Team Members')).toBeDefined();
    expect(screen.getByText('All Members')).toBeDefined();
    expect(screen.getByText('Pending Invitations')).toBeDefined();
    expect(team.fetchStaff).toHaveBeenCalledTimes(1);
    expect(team.fetchPendingInvitations).toHaveBeenCalledTimes(1);
  });

  it('FR-RBAC-07 hides inviting and invitations from a user without users.manage', () => {
    signIn(SALES);
    renderTeam([member()]);

    expect(screen.queryByText('Invite Member')).toBeNull();
    expect(screen.queryByText('Pending Invitations')).toBeNull();
    expect(screen.queryByLabelText('Deactivate sam@example.com')).toBeNull();
    expect(team.fetchRoles).not.toHaveBeenCalled();
  });

  it('FR-USR-02 shows each member\'s role by its name', () => {
    renderTeam([member({ roleId: 'r-reception', roleKey: 'RECEPTION', roleNameSq: 'Recepsion', roleNameEn: 'Reception' })]);

    expect(screen.getByText('Sam Rep')).toBeDefined();
    expect(screen.getByText('Reception')).toBeDefined();
  });

  it('names a pending invitation\'s role from the workspace roles', async () => {
    renderTeam([], [{ id: 'i1', email: 'new@example.com', role: 'STAFF', roleId: 'r-reception', expiresAt: '2026-10-01T00:00:00Z' }]);

    expect(await screen.findByText('Reception')).toBeDefined();
  });

  it('FR-USR-02 invites with a role chosen from the workspace\'s roles', async () => {
    renderTeam();
    await waitFor(() => expect(team.fetchRoles).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Invite Member'));
    const dialog = await screen.findByRole('dialog');
    const roleSelect = within(dialog).getByLabelText(/^Role/) as HTMLSelectElement;
    expect(Array.from(roleSelect.options).map((o) => o.textContent)).toEqual(['Sales User', 'Reception', 'Administrator']);
    expect(roleSelect.value).toBe('r-sales');

    fireEvent.change(within(dialog).getByLabelText(/Email Address/), { target: { value: 'new@example.com' } });
    fireEvent.change(roleSelect, { target: { value: 'r-reception' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send Invitation' }));

    await waitFor(() => expect(team.inviteStaff).toHaveBeenCalledWith('new@example.com', 'r-reception', undefined));
  });

  it('FR-USR-03 changes a member\'s role by id', async () => {
    renderTeam([member()]);
    await waitFor(() => expect(team.fetchRoles).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText('Edit sam@example.com'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Role/), { target: { value: 'r-admin' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(team.updateStaffRole).toHaveBeenCalledWith('s1', 'r-admin', undefined));
  });

  describe('deactivation', () => {
    const openDialog = async (email = 'sam@example.com') => {
      fireEvent.click(screen.getByLabelText(`Deactivate ${email}`));
      return screen.findByText('Deactivate team member?');
    };

    it('is offered for any other member, an Administrator included, but not for yourself', () => {
      renderTeam([member({ roleKey: 'ADMINISTRATOR', role: 'BUSINESS_OWNER' }), member({ id: 'me', email: 'me@example.com' })]);

      expect(screen.getByLabelText('Deactivate sam@example.com')).toBeDefined();
      expect(screen.queryByLabelText('Deactivate me@example.com')).toBeNull();
    });

    it('requires confirmation and does not deactivate on click alone', async () => {
      renderTeam([member()]);
      await openDialog();
      expect(team.deactivateStaff).not.toHaveBeenCalled();
    });

    it('FR-USR-04 says the session stops on their next action, and that the account is kept', async () => {
      renderTeam([member()]);
      await openDialog();

      expect(screen.getByText(/stops working on their next action/i)).toBeDefined();
      expect(screen.getByText(/kept, not deleted/i)).toBeDefined();
    });

    it('deactivates a member with no companies without asking for a colleague', async () => {
      renderTeam([member()]);
      await openDialog();

      fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

      await waitFor(() => expect(team.deactivateStaff).toHaveBeenCalledWith('s1', undefined));
    });

    describe('forced reassignment (FR-USR-05)', () => {
      beforeEach(() => {
        team.fetchDeactivationImpact.mockResolvedValue({
          clients: 2,
          upcomingAppointments: 1,
          openContracts: 1,
          companies: [{ id: 'co1', name: 'Alfa sh.p.k.' }, { id: 'co2', name: 'Beta' }],
        });
      });

      it('FR-USR-05 lists the companies and blocks confirming until a colleague is chosen', async () => {
        renderTeam([member(), COLLEAGUE, RETIRED]);
        await openDialog();

        expect(await screen.findByText('Alfa sh.p.k.')).toBeDefined();
        expect(screen.getByText(/salesperson for 2 companies/i)).toBeDefined();
        expect(screen.getByText(/1 open contract moves with the companies/i)).toBeDefined();
        expect(screen.getByText(/1 upcoming appointment stays with them/i)).toBeDefined();
        expect((screen.getByRole('button', { name: 'Deactivate' }) as HTMLButtonElement).disabled).toBe(true);

        // Only active colleagues, never the member leaving.
        const select = screen.getByLabelText(/Reassign to/) as HTMLSelectElement;
        expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'c1']);
      });

      it('FR-USR-05 hands the companies to the chosen colleague', async () => {
        renderTeam([member(), COLLEAGUE]);
        await openDialog();
        await screen.findByText('Alfa sh.p.k.');

        fireEvent.change(screen.getByLabelText(/Reassign to/), { target: { value: 'c1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

        await waitFor(() => expect(team.deactivateStaff).toHaveBeenCalledWith('s1', 'c1'));
      });
    });

    it('FR-RBAC-08 explains a refusal to remove the last role manager, and stays open', async () => {
      team.deactivateStaff.mockRejectedValue({ response: { status: 409, data: { code: 'LAST_ROLE_MANAGER' } } });
      renderTeam([member()]);
      await openDialog();

      fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/last active user who can manage roles/i);
      expect(screen.getByText('Deactivate team member?')).toBeDefined();
    });
  });
});
