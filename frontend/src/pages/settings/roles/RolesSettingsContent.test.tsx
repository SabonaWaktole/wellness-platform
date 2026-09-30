import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { RolesSettingsContent } from './RolesSettingsContent';
import { useRoleAdmin } from '../../../hooks/useRoleAdmin';

vi.mock('../../../hooks/useRoleAdmin');

const CATALOGUE = [
  { key: 'companies.view', group: 'companies', supportsScope: true },
  { key: 'contracts.validity.view', group: 'contracts', supportsScope: true },
  { key: 'commercial.view', group: 'sales', supportsScope: true, milestone: 'M2' },
  { key: 'notes.add', group: 'activities', supportsScope: true },
  { key: 'roles.manage', group: 'admin', supportsScope: false },
  { key: 'audit.view', group: 'admin', supportsScope: false },
];

const RECEPTION = {
  id: 'r-reception',
  key: 'RECEPTION',
  nameSq: 'Recepsion',
  nameEn: 'Reception',
  isSystem: true,
  baseKey: null,
  grants: { 'companies.view': 'ALL', 'contracts.validity.view': 'ALL', 'notes.add': 'ALL' },
  users: 2,
};
const ADMIN = {
  id: 'r-admin',
  key: 'ADMINISTRATOR',
  nameSq: 'Administrator',
  nameEn: 'Administrator',
  isSystem: true,
  baseKey: null,
  grants: { 'companies.view': 'ALL', 'roles.manage': true, 'audit.view': true },
  users: 1,
};
const CUSTOM = {
  id: 'r-night',
  key: 'CUSTOM_1',
  nameSq: 'Recepsion natën',
  nameEn: 'Night reception',
  isSystem: false,
  baseKey: 'RECEPTION',
  grants: { 'companies.view': 'ALL' },
  users: 0,
};

const apiError = (code: string) => Object.assign(new Error(code), { response: { data: { code } } });

describe('RolesSettingsContent', () => {
  const admin = {
    fetchRoles: vi.fn(),
    savePermissions: vi.fn(),
    copyRole: vi.fn(),
    renameRole: vi.fn(),
    deleteRole: vi.fn(),
  };

  const renderRoles = (roles = [RECEPTION, ADMIN, CUSTOM]) => {
    (useRoleAdmin as any).mockReturnValue({ catalogue: CATALOGUE, roles, loading: false, loadFailed: false, ...admin });
    return render(<RolesSettingsContent />);
  };

  const openRole = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));

  beforeEach(() => {
    vi.clearAllMocks();
    admin.savePermissions.mockResolvedValue(undefined);
    admin.copyRole.mockResolvedValue('r-new');
    admin.renameRole.mockResolvedValue(undefined);
    admin.deleteRole.mockResolvedValue(undefined);
  });

  it('FR-RBAC-03 lists every role with its kind and how many users hold it', () => {
    renderRoles();

    expect(admin.fetchRoles).toHaveBeenCalledTimes(1);
    const list = screen.getByRole('list', { name: 'Roles' });
    expect(within(list).getByRole('button', { name: /Reception.*System.*2 users/ })).toBeDefined();
    expect(within(list).getByRole('button', { name: /Night reception.*Custom.*0 users/ })).toBeDefined();
  });

  it('FR-RBAC-03 shows the selected role\'s permissions by group, with their scopes', () => {
    renderRoles();

    expect(screen.getByRole('heading', { name: 'Reception' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Contracts' })).toBeDefined();
    expect((screen.getByLabelText('View contract validity') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Manage roles & permissions') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Reach of View companies') as HTMLSelectElement).value).toBe('ALL');
    // A plain capability has no scope to choose.
    expect(screen.queryByLabelText('Reach of Manage roles & permissions')).toBeNull();
  });

  it('marks permissions whose feature arrives in a later milestone', () => {
    renderRoles();

    const row = screen.getByLabelText(/View commercial details/).closest('li')!;
    expect(within(row).getByText('Available from Milestone 2')).toBeDefined();
  });

  it('UAT-3 FR-RBAC-03 removes contract validity from Reception and saves the whole new set', async () => {
    renderRoles();
    const save = screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('View contract validity'));
    expect(screen.getByText('You have unsaved changes.')).toBeDefined();
    fireEvent.click(save);

    await waitFor(() =>
      expect(admin.savePermissions).toHaveBeenCalledWith('r-reception', { 'companies.view': 'ALL', 'notes.add': 'ALL' })
    );
    expect(await screen.findByText(/Saved\. Everyone with this role/)).toBeDefined();
  });

  it('changes a permission\'s reach', async () => {
    renderRoles();

    fireEvent.change(screen.getByLabelText('Reach of Add notes'), { target: { value: 'TEAM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(admin.savePermissions).toHaveBeenCalledWith('r-reception', expect.objectContaining({ 'notes.add': 'TEAM' }))
    );
  });

  it('grants a newly ticked scoped permission at Own, the narrowest reach', async () => {
    renderRoles();

    fireEvent.click(screen.getByLabelText(/View commercial details/));

    expect((screen.getByLabelText(/Reach of View commercial details/) as HTMLSelectElement).value).toBe('OWN');
  });

  it('Discard puts the saved permissions back', () => {
    renderRoles();

    fireEvent.click(screen.getByLabelText('View contract validity'));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect((screen.getByLabelText('View contract validity') as HTMLInputElement).checked).toBe(true);
  });

  it('FR-RBAC-08 explains a refused save in the user\'s language and keeps the edit', async () => {
    admin.savePermissions.mockRejectedValue(apiError('LAST_ROLE_MANAGER'));
    renderRoles();
    openRole(/^Administrator/);

    fireEvent.click(screen.getByLabelText('Manage roles & permissions'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/No one else could manage roles/)).toBeDefined();
    expect((screen.getByLabelText('Manage roles & permissions') as HTMLInputElement).checked).toBe(false);
  });

  it('asks before leaving a role with unsaved changes', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderRoles();

    fireEvent.click(screen.getByLabelText('View contract validity'));
    openRole(/^Administrator/);

    expect(confirm).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Reception' })).toBeDefined();
    confirm.mockRestore();
  });

  it('FR-RBAC-04 copies the selected role under new names and opens the copy', async () => {
    renderRoles();

    fireEvent.click(screen.getByRole('button', { name: 'Copy role' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Name in Albanian/), { target: { value: 'Recepsion fundjavë' } });
    fireEvent.change(within(dialog).getByLabelText(/Name in English/), { target: { value: 'Weekend reception' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create role' }));

    await waitFor(() =>
      expect(admin.copyRole).toHaveBeenCalledWith('r-reception', { nameSq: 'Recepsion fundjavë', nameEn: 'Weekend reception' })
    );
  });

  it('shows a refused copy inside the dialog', async () => {
    admin.copyRole.mockRejectedValue(apiError('ROLE_NAME_TAKEN'));
    renderRoles();

    fireEvent.click(screen.getByRole('button', { name: 'Copy role' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Name in Albanian/), { target: { value: 'CEO' } });
    fireEvent.change(within(dialog).getByLabelText(/Name in English/), { target: { value: 'CEO' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create role' }));

    expect(await within(dialog).findByText('Another role already has this name.')).toBeDefined();
  });

  it('FR-RBAC-01 offers no rename or delete for a system role', () => {
    renderRoles();

    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.getByText(/A system role keeps its name/)).toBeDefined();
  });

  it('renames a custom role', async () => {
    renderRoles();
    openRole(/^Night reception/);

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog');
    const english = within(dialog).getByLabelText(/Name in English/) as HTMLInputElement;
    expect(english.value).toBe('Night reception');
    fireEvent.change(english, { target: { value: 'Late reception' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save name' }));

    await waitFor(() =>
      expect(admin.renameRole).toHaveBeenCalledWith('r-night', { nameSq: 'Recepsion natën', nameEn: 'Late reception' })
    );
  });

  it('deletes a custom role after confirming, and says why when it is still assigned', async () => {
    admin.deleteRole.mockRejectedValueOnce(apiError('ROLE_IN_USE'));
    renderRoles();
    openRole(/^Night reception/);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete role' }));

    expect(await within(dialog).findByText(/still assigned/)).toBeDefined();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete role' }));
    await waitFor(() => expect(admin.deleteRole).toHaveBeenCalledTimes(2));
    expect(admin.deleteRole).toHaveBeenCalledWith('r-night');
  });
});
