import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '../../../store/useAuthStore';

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
