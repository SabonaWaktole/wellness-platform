import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { routes } from './index';

const allPaths = (list: RouteObject[]): string[] =>
  list.flatMap((route) => [
    ...(route.path ? [route.path] : []),
    ...(route.children ? allPaths(route.children) : []),
  ]);

describe('what an anonymous visitor can reach', () => {
  it('FR-BR-05 sends the site root to sign-in rather than to a marketing page', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('FR-BR-05 has no sign-up, onboarding, subscription or landing route', () => {
    // Accounts are created by an administrator in this edition. The remaining
    // public routes are sign-in, password recovery, and links someone was sent
    // (an invitation, a quotation, a form). Settings pages sit behind sign-in,
    // so Settings → Pricing (M2 Slice 3) is not a public pricing page.
    const saasPaths = allPaths(routes).filter(
      (path) => !path.startsWith('settings/') && /regist|sign-?up|onboard|landing|pricing|subscri/i.test(path)
    );
    expect(saasPaths).toEqual([]);
  });
});
