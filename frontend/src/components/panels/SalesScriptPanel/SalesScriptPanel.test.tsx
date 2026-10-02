import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { AppLayout } from '../../layout/AppLayout/AppLayout';
import { TenantGuard } from '../../../routes/TenantGuard';
import { useAuthStore } from '../../../store/useAuthStore';
import { useSalesScriptStore } from '../../../store/useSalesScriptStore';
import { salesScriptService, type PublishedScript } from '../../../services/salesScriptService';

vi.mock('../../notifications/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('../../../services/salesScriptService', () => ({ salesScriptService: { published: vi.fn() } }));

const text = (value: string) => ({ type: 'text', text: value });
const heading = (value: string) => ({ type: 'heading', attrs: { level: 2 }, content: [text(value)] });
const paragraph = (value: string) => ({ type: 'paragraph', content: [text(value)] });

const SCRIPT: PublishedScript = {
  version: 3,
  publishedAt: '2026-10-01T10:00:00.000Z',
  language: 'en',
  content: {
    type: 'doc',
    content: [
      heading('Opening'),
      paragraph('Introduce yourself.'),
      heading('Pricing questions'),
      paragraph('Ask about the çmimi before quoting a çmim.'),
    ],
  },
  sections: [
    { anchor: 'section-1', title: 'Opening' },
    { anchor: 'section-2', title: 'Pricing questions' },
  ],
};

const signIn = (permissions: Record<string, true>) =>
  useAuthStore.setState({
    user: { userId: 'u1', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', permissions },
    isAuthenticated: true,
  } as any);

/** Two pages, each mounting its own AppLayout, as every real page does. */
const CompanyPage = () => {
  const navigate = useNavigate();
  return (
    <AppLayout userName="Besa">
      <h1>{'Company'}</h1>
      <button type="button" onClick={() => navigate('/acme/pricing')}>
        {'Go to pricing'}
      </button>
    </AppLayout>
  );
};

const PricingPage = () => (
  <AppLayout userName="Besa">
    <h1>{'Pricing'}</h1>
    <label>
      {'Employees'}
      <input />
    </label>
  </AppLayout>
);

const renderApp = () =>
  render(
    <MemoryRouter initialEntries={['/acme/companies']}>
      <Routes>
        <Route path="/:tenantSlug" element={<TenantGuard />}>
          <Route path="companies" element={<CompanyPage />} />
          <Route path="pricing" element={<PricingPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe('Sales script panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSalesScriptStore.setState({ isOpen: false });
    vi.mocked(salesScriptService.published).mockResolvedValue(SCRIPT);
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('FR-SCR-01 shows the Sales script button to a user with script.view, and not to Reception', () => {
    signIn({ 'script.view': true });
    const { unmount } = renderApp();
    expect(screen.getByRole('button', { name: 'Sales script' })).toBeInTheDocument();
    unmount();

    signIn({ 'clients.view': true });
    renderApp();
    expect(screen.queryByRole('button', { name: 'Sales script' })).toBeNull();
  });

  it('FR-SCR-02 stays open, at the same scroll position, while the user moves to another page and types in a form', async () => {
    signIn({ 'script.view': true });
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'Sales script' }));
    expect(await screen.findByRole('heading', { name: 'Pricing questions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sales script' })).toHaveAttribute('aria-pressed', 'true');
    const body = screen.getByTestId('sales-script-body');
    body.scrollTop = 240;

    fireEvent.click(screen.getByRole('button', { name: 'Go to pricing' }));
    expect(screen.getByRole('heading', { name: 'Pricing', level: 1 })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Employees' }), { target: { value: '12' } });

    // The same panel, not a new one: nothing was unmounted or fetched again.
    expect(screen.getByTestId('sales-script-body')).toBe(body);
    expect(body.scrollTop).toBe(240);
    expect(screen.getByRole('textbox', { name: 'Employees' })).toHaveValue('12');
    expect(salesScriptService.published).toHaveBeenCalledTimes(1);
  });

  it('FR-SCR-02 closes with its close button, and opens again on the published text', async () => {
    signIn({ 'script.view': true });
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Sales script' }));
    await screen.findByRole('heading', { name: 'Opening' });

    fireEvent.click(screen.getByRole('button', { name: 'Close the sales script' }));
    await waitFor(() => expect(screen.queryByTestId('sales-script-panel')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Sales script' }));
    await screen.findByRole('heading', { name: 'Opening' });
    expect(salesScriptService.published).toHaveBeenCalledTimes(2);
  });

  it('FR-SCR-03 lists the section headings and scrolls to the one clicked', async () => {
    signIn({ 'script.view': true });
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Sales script' }));
    const sections = await screen.findByRole('navigation', { name: 'Sections' });

    expect(Array.from(sections.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Opening', 'Pricing questions']);
    fireEvent.click(screen.getByRole('button', { name: 'Pricing questions' }));
    const target = screen.getByRole('heading', { name: 'Pricing questions' });
    expect(target.id).toBe('sales-script-section-2');
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts.at(-1)).toBe(target);
  });

  it('FR-SCR-08 searching "çmim" marks the matches and counts them', async () => {
    signIn({ 'script.view': true });
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Sales script' }));
    await screen.findByRole('heading', { name: 'Opening' });

    await act(async () => {
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search the script' }), { target: { value: 'çmim' } });
    });
    const marks = Array.from(screen.getByTestId('sales-script-body').querySelectorAll('mark')).map((m) => m.textContent);
    expect(marks).toEqual(['çmim', 'çmim']);
    expect(screen.getByRole('status')).toHaveTextContent('2 matches');
  });

  it('asks for the script in the reader\'s language', async () => {
    signIn({ 'script.view': true });
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Sales script' }));
    await screen.findByRole('heading', { name: 'Opening' });
    // The test i18n setup reads English.
    expect(salesScriptService.published).toHaveBeenCalledWith('acme', 'en');
  });
});
