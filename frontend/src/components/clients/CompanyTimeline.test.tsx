import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CompanyTimeline } from './CompanyTimeline';
import { useAuthStore } from '../../store/useAuthStore';
import type { ClientHistory, TimelineEntry } from '../../types/client';

const RECEPTION = { 'companies.view': 'ALL', 'notes.view': 'ALL', 'notes.add': 'ALL', 'contracts.validity.view': 'ALL' };
const ADMIN = {
  ...RECEPTION,
  'activities.view': 'ALL',
  'quotations.manage': 'ALL',
  'commercial.view': 'ALL',
  'payments.view': 'ALL',
};

const signIn = (permissions: Record<string, string>) =>
  useAuthStore.setState({
    isAuthenticated: true,
    user: { userId: 'u1', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantCurrency: 'EUR', tenantLocale: 'en-GB', permissions },
  } as any);

const entry = (overrides: Partial<TimelineEntry> & Pick<TimelineEntry, 'id' | 'type' | 'category'>): TimelineEntry => ({
  timestamp: '2026-01-05T10:00:00.000Z',
  actor: null,
  details: {},
  ...overrides,
});

const history = (timeline: TimelineEntry[], nextCursor: string | null = null): ClientHistory => ({ timeline, nextCursor });

const renderTimeline = (props: Partial<React.ComponentProps<typeof CompanyTimeline>> = {}) => {
  const handlers = { onTypesChange: vi.fn(), onLoadMore: vi.fn() };
  render(
    <CompanyTimeline
      history={history([])}
      types={[]}
      isLoading={false}
      isLoadingMore={false}
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe('CompanyTimeline (FR-CMP-05)', () => {
  beforeEach(() => signIn(ADMIN));

  it('FR-CMP-05 renders a translated title for every event type', () => {
    renderTimeline({
      history: history([
        entry({ id: '1', category: 'CONTACT', type: 'CONTACT_ADDED', details: { name: 'Jane Doe', position: 'Manager' } }),
        entry({ id: '2', category: 'CONTACT', type: 'CONTACT_REMOVED', details: { name: 'John Roe' } }),
        entry({
          id: '3', category: 'NOTE', type: 'INTERACTION_ADDED',
          actor: { id: 'u2', name: 'Anna Hoxha' }, details: { channel: 'NOTE', content: 'Prefers mornings' },
        }),
        entry({ id: '4', category: 'ACTIVITY', type: 'INTERACTION_ADDED', details: { channel: 'CALL', content: 'Called' } }),
        entry({ id: '5', category: 'ACTIVITY', type: 'APPOINTMENT_COMPLETED', details: { status: 'COMPLETED' } }),
        entry({ id: '6', category: 'QUOTATION', type: 'QUOTATION_CREATED', details: { reference: 'AB12', status: 'DRAFT', total: 500 } }),
        entry({
          id: '7', category: 'QUOTATION', type: 'QUOTATION_STATUS_CHANGED',
          details: { reference: 'AB12', fromStatus: 'SENT', toStatus: 'EXPIRED' },
        }),
        entry({
          id: '8', category: 'CONTRACT', type: 'CONTRACT_CREATED',
          details: { reference: 'CD34', planName: 'Gold', startsAt: '2026-01-01', endsAt: '2026-12-31', billingPeriod: 'MONTHLY', amount: 100 },
        }),
        entry({ id: '9', category: 'PAYMENT', type: 'PAYMENT_RECEIVED', details: { reference: 'CD34', status: 'PAID', amount: 100, paidAmount: 100 } }),
      ]),
    });

    expect(screen.getByText('Contact added: Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Manager')).toBeInTheDocument();
    expect(screen.getByText('Contact removed: John Roe')).toBeInTheDocument();
    expect(screen.getByText('Note logged')).toBeInTheDocument();
    expect(screen.getByText(/by Anna Hoxha/)).toBeInTheDocument();
    expect(screen.getByText('Call logged')).toBeInTheDocument();
    expect(screen.getByText('Appointment')).toBeInTheDocument();
    expect(screen.getByText('Offer AB12 created')).toBeInTheDocument();
    expect(screen.getByText(/Total: /)).toBeInTheDocument();
    // A status change with no person behind it is the scheduler's.
    expect(screen.getByText(/by System/)).toBeInTheDocument();
    expect(screen.getByText('Contract CD34 created · Gold')).toBeInTheDocument();
    expect(screen.getByText('Payment received · contract CD34')).toBeInTheDocument();
  });

  it('FR-DEAL-20 shows a deal\'s creation and its stage changes, an automatic one as "System"', () => {
    signIn({ ...ADMIN, 'deals.view': 'ALL' });
    renderTimeline({
      history: history([
        entry({
          id: 'd1', category: 'DEAL', type: 'DEAL_CREATED', actor: { id: 'u2', name: 'Anna Hoxha' },
          details: { dealId: 'x', title: null, type: 'NEW_CONTRACT' },
        }),
        entry({
          id: 'd2', category: 'DEAL', type: 'DEAL_STAGE_CHANGED',
          details: { dealId: 'x', title: 'Two sites', type: 'EXTRA_SERVICES', fromStage: 'NEW_LEAD', toStage: 'CONTACTED' },
        }),
      ]),
    });

    expect(screen.getByText('Deal created: New contract')).toBeInTheDocument();
    expect(screen.getByText('Deal Two sites: New lead → Contacted')).toBeInTheDocument();
    expect(screen.getByText(/by System/)).toBeInTheDocument();
  });

  it('FR-DEAL-20 offers the Deals chip only with deals.view', () => {
    signIn({ ...ADMIN, 'deals.view': 'OWN' });
    renderTimeline();
    expect(screen.getByRole('button', { name: 'Deals' })).toBeInTheDocument();
  });

  it('FR-RBAC-06 shows no amount when the server has redacted it', () => {
    signIn(RECEPTION);
    renderTimeline({
      history: history([
        entry({
          id: '8', category: 'CONTRACT', type: 'CONTRACT_CREATED',
          details: { reference: 'CD34', planName: 'Gold', startsAt: '2026-01-01', endsAt: '2026-12-31', billingPeriod: 'MONTHLY' },
        }),
      ]),
    });

    // Validity only: no " · <amount> / <period>" suffix.
    expect(screen.getByText(/^Valid /).textContent).not.toContain('·');
    expect(screen.queryByText(/€|EUR/)).toBeNull();
  });

  it('FR-RBAC-07 offers a filter chip only for the categories the viewer can see', () => {
    signIn(RECEPTION);
    renderTimeline();

    const chips = screen.getAllByRole('button').map((b) => b.textContent);
    expect(chips).toEqual(['All', 'Contacts', 'Notes', 'Contracts']);
  });

  it('FR-CMP-05 toggles a category on and off, and All clears the filter', () => {
    const { onTypesChange } = renderTimeline({ types: ['NOTE'] });

    fireEvent.click(screen.getByRole('button', { name: 'Contracts' }));
    expect(onTypesChange).toHaveBeenLastCalledWith(['NOTE', 'CONTRACT']);

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(onTypesChange).toHaveBeenLastCalledWith([]);

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onTypesChange).toHaveBeenLastCalledWith([]);
    expect(screen.getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('FR-CMP-05 offers "Load more" only while there is a next page', () => {
    const { onLoadMore } = renderTimeline({
      history: history([entry({ id: '1', category: 'NOTE', type: 'INTERACTION_ADDED', details: { channel: 'NOTE' } })], 'next'),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('distinguishes an empty history from an empty filter', () => {
    renderTimeline();
    expect(screen.getByText("Nothing in this company's history yet.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('says so when nothing matches the filter', () => {
    renderTimeline({ types: ['PAYMENT'] });
    expect(screen.getByText('Nothing of this type yet.')).toBeInTheDocument();
  });
});

describe('CompanyTimeline activities (M2 Slice 7)', () => {
  const SALES_USER = { 'companies.view': 'OWN', 'activities.view': 'OWN', 'activities.add': 'OWN', 'notes.view': 'OWN', 'notes.add': 'OWN' };
  const SALES_MANAGER = { ...SALES_USER, 'activities.view': 'TEAM', 'activities.add': 'TEAM', 'notes.add': 'TEAM' };
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const visit = (overrides: Record<string, unknown> = {}) =>
    entry({
      id: 'interaction:i1',
      category: 'ACTIVITY',
      type: 'INTERACTION_ADDED',
      timestamp: hoursAgo(2),
      actor: { id: 'u1', name: 'Besa Test' },
      details: {
        id: 'i1', clientId: 'c1', channel: 'VISIT', content: 'Walked through the premises',
        occurredAt: hoursAgo(2), recordedAt: hoursAgo(1), updatedAt: null,
        contact: { id: 'p1', name: 'Elira Hoxha' },
        result: { id: 'r1', nameSq: 'U caktua takim', nameEn: 'Meeting agreed' },
        clientFeedback: 'Likes the package', nextAction: 'Send the offer',
        ...overrides,
      },
    });

  it('FR-ACT-05 shows the type, contact, result, feedback and next action of an activity', () => {
    signIn(SALES_USER);
    renderTimeline({ history: history([visit()]) });

    expect(screen.getByText(/Visit/)).toBeInTheDocument();
    expect(screen.getByText('Elira Hoxha')).toBeInTheDocument();
    expect(screen.getByText('Meeting agreed')).toBeInTheDocument();
    expect(screen.getByText('Likes the package')).toBeInTheDocument();
    expect(screen.getByText('Send the offer')).toBeInTheDocument();
    expect(screen.getByText('Walked through the premises')).toBeInTheDocument();
  });

  it('FR-ACT-07 a legacy interaction shows with its text and no empty fields', () => {
    signIn(SALES_USER);
    renderTimeline({
      history: history([entry({ id: 'interaction:old', category: 'ACTIVITY', type: 'INTERACTION_ADDED', details: { id: 'old', channel: 'MEETING', content: 'Old meeting', contact: null, result: null } })]),
    });
    expect(screen.getByText('Old meeting')).toBeInTheDocument();
    expect(screen.queryByText('Contact person')).not.toBeInTheDocument();
  });

  it('FR-ACT-06 the author is offered Edit within 24 hours, not after', () => {
    signIn(SALES_USER);
    const onEditActivity = vi.fn();
    renderTimeline({ history: history([visit(), visit({ id: 'i2', recordedAt: hoursAgo(48) })].map((e, i) => ({ ...e, id: `interaction:${i}` }))), onEditActivity });

    const edits = screen.getAllByRole('button', { name: 'Edit' });
    expect(edits).toHaveLength(1);
    fireEvent.click(edits[0]);
    expect(onEditActivity).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1', channel: 'VISIT', contact: { id: 'p1', name: 'Elira Hoxha' } }));
  });

  it("FR-ACT-06 the Sales Manager is offered Edit on anyone's activity at any age", () => {
    signIn(SALES_MANAGER);
    renderTimeline({ history: history([visit({ recordedAt: hoursAgo(72) })]), onEditActivity: vi.fn() });
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});
