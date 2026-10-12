import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '../../../store/useAuthStore';
import { useSupportStore } from '../../../store/useSupportStore';

const signInTo = (tenantName: string | null) =>
  useAuthStore.setState({
    user: {
      userId: 'u1',
      email: 'admin@wellness.test',
      role: 'BUSINESS_OWNER',
      tenantId: 't1',
      tenantSlug: 'wellness-albania',
      tenantName,
    },
    isAuthenticated: true,
  });

describe('Sidebar workspace heading', () => {
  beforeEach(() => signInTo('Wellness Albania'));

  it('FR-BR-04 names the workspace the user is signed in to', () => {
    render(<Sidebar navItems={[]} />);

    expect(screen.getByRole('heading', { name: 'Wellness Albania' })).toBeTruthy();
    // Was the URL slug on most pages.
    expect(screen.queryByText('wellness-albania')).toBeNull();
  });

  it('FR-BR-05 shows no SaaS subscription tier', () => {
    const { container } = render(<Sidebar navItems={[]} />);

    expect(container.textContent).not.toMatch(/tier/i);
  });

  it('still shows a caption where a shell gives one, like the platform console', () => {
    render(<Sidebar orgName="Platform" orgTier="Administration" navItems={[]} />);

    expect(screen.getByRole('heading', { name: 'Platform' })).toBeTruthy();
    expect(screen.getByText('Administration')).toBeTruthy();
  });
});

describe('Sidebar Support item', () => {
  beforeEach(() => {
    signInTo('Wellness Albania');
    act(() => useSupportStore.getState().closePanel());
  });

  it('SUP-01 opens the Support panel (the item used to do nothing)', () => {
    render(<Sidebar navItems={[]} />);
    fireEvent.click(screen.getByText('Support'));
    expect(useSupportStore.getState().panelOpen).toBe(true);
    act(() => useSupportStore.getState().closePanel());
  });

  it('SUP-01 closes the mobile sidebar so the panel is not hidden behind it', () => {
    const onClose = vi.fn();
    render(<Sidebar navItems={[]} isOpen onClose={onClose} />);
    fireEvent.click(screen.getByText('Support'));
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => useSupportStore.getState().closePanel());
  });

  it('SUP-01 does not navigate: the hash stays as it was', () => {
    render(<Sidebar navItems={[]} />);
    const before = window.location.hash;
    fireEvent.click(screen.getByText('Support'));
    expect(window.location.hash).toBe(before);
    act(() => useSupportStore.getState().closePanel());
  });
});
