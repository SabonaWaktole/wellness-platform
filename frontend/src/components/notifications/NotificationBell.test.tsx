import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { useNotifications } from '../../hooks/useNotifications';
import { useTeam } from '../../hooks/useTeam';

vi.mock('../../hooks/useNotifications');
vi.mock('../../hooks/useTeam');

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

/**
 * The bell's job is to render STORED notifications into CURRENT text: an i18n
 * key plus snapshot params, with the actor resolved live from the staff list.
 * These tests pin that split, because getting it wrong is invisible until
 * someone changes their name or switches language.
 */
describe('NotificationBell', () => {
  const markRead = vi.fn();
  const markAllRead = vi.fn();

  const staff = [
    { id: 'u1', email: 'ada@test', firstName: 'Ada', lastName: 'Lovelace' },
    { id: 'u2', email: 'grace@test', firstName: 'Grace', lastName: 'Hopper' },
  ];

  const notification = (over = {}) => ({
    id: 'n1',
    type: 'CLIENT_ASSIGNED',
    params: { client: 'Acme Corp' },
    actorUserId: 'u1',
    entityType: 'CLIENT' as const,
    entityId: 'client-9',
    readAt: null,
    createdAt: '2026-07-27T10:00:00.000Z',
    ...over,
  });

  const setup = (items: any[] = [], unreadCount = 0) => {
    (useNotifications as any).mockReturnValue({
      items, unreadCount, isLoading: false, fetchNotifications: vi.fn(), markRead, markAllRead,
    });
    (useTeam as any).mockReturnValue({ staff, fetchStaff: vi.fn() });

    return render(
      <MemoryRouter initialEntries={['/acme/dashboard']}>
        <Routes>
          <Route path="/:tenantSlug/dashboard" element={<NotificationBell />} />
        </Routes>
      </MemoryRouter>
    );
  };

  beforeEach(() => vi.clearAllMocks());

  it('shows no badge when everything is read', () => {
    setup([notification({ readAt: '2026-07-27T11:00:00.000Z' })], 0);

    expect(screen.getByRole('button', { name: /notifications/i })).toBeDefined();
    expect(screen.queryByText('1')).toBeNull();
  });

  it('shows the unread count and announces it in the accessible name', () => {
    setup([notification()], 3);

    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByRole('button', { name: /3 unread/i })).toBeDefined();
  });

  it('caps a very large count rather than stretching the badge', () => {
    setup([notification()], 250);

    expect(screen.getByText('99+')).toBeDefined();
  });

  it('renders the stored key with its params and the LIVE actor name', async () => {
    setup([notification()], 1);

    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));

    // "Ada Lovelace" comes from the staff list, not from the stored row;
    // "Acme Corp" comes from the stored snapshot.
    expect(screen.getByText('Ada Lovelace assigned Acme Corp to you')).toBeDefined();
  });

  it('falls back gracefully when the actor is no longer in the staff list', async () => {
    setup([notification({ actorUserId: 'departed' })], 1);

    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));

    // Never a raw UUID where a name belongs — TD-021's rule.
    expect(screen.queryByText(/departed/)).toBeNull();
    expect(screen.getByText(/assigned Acme Corp to you/)).toBeDefined();
  });

  it('reads a NULL actor on Accept/Reject as the client, not the system', async () => {
    // These two types only ever have a NULL actorUserId when the client
    // responded through their public quotation link — nobody else can
    // produce that combination (see RespondToPublicQuotationUseCase).
    setup(
      [
        notification({
          id: 'n2',
          type: 'QUOTATION_REJECTED',
          params: { reference: 'ABC123' },
          actorUserId: null,
          entityType: 'QUOTATION' as const,
        }),
      ],
      1
    );

    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));

    expect(screen.getByText('Quotation ABC123 was marked rejected by The client')).toBeDefined();
  });

  it('keeps a NULL actor as the system for events nobody chose, like expiry', async () => {
    setup(
      [
        notification({
          id: 'n3',
          type: 'QUOTATION_EXPIRED',
          params: { reference: 'ABC123' },
          actorUserId: null,
          entityType: 'QUOTATION' as const,
        }),
      ],
      1
    );

    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));

    expect(screen.getByText('Quotation ABC123 has expired')).toBeDefined();
  });

  it('marks a notification read and navigates to its target when clicked', async () => {
    setup([notification()], 1);

    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await userEvent.click(screen.getByText('Ada Lovelace assigned Acme Corp to you'));

    expect(markRead).toHaveBeenCalledWith('n1');
    expect(mockNavigate).toHaveBeenCalledWith('/acme/clients/client-9');
  });

  it('FR-PAY-13 an overdue instalment opens its contract', async () => {
    setup(
      [
        notification({
          id: 'n9',
          type: 'PAYMENT_OVERDUE',
          params: { clientName: 'Alfa Wellness', planName: 'Gold', instalment: 2, dueDate: '2026-10-01' },
          actorUserId: null,
          entityType: 'CONTRACT' as const,
          entityId: 'contract-7',
        }),
      ],
      1
    );

    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await userEvent.click(screen.getByText(/Alfa Wellness's instalment 2 of the Gold contract was due on 2026-10-01 and is overdue/));

    expect(mockNavigate).toHaveBeenCalledWith('/acme/contracts/contract-7');
  });

  it('FR-TIR-11 the expiring-memberships summary opens the member list on the Expiring soon filter', async () => {
    setup([notification({ id: 'n10', type: 'MEMBERSHIP_EXPIRING', params: { count: 3, windowDays: 30 }, actorUserId: null, entityType: null, entityId: null })], 1);

    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await userEvent.click(screen.getByText(/3 Wellness\+ membership\(s\) end within 30 days/));

    expect(mockNavigate).toHaveBeenCalledWith('/acme/members?expiringSoon=true');
  });

  it('FR-VIP-04 a VIP review notice opens the member', async () => {
    setup(
      [notification({ id: 'n11', type: 'VIP_REVIEW_DUE', params: { memberName: 'Ana Hoxha', memberNumber: 'WP-000001', reviewDate: '2027-01-31' }, actorUserId: null, entityType: 'MEMBER' as const, entityId: 'm1' })],
      1
    );

    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await userEvent.click(screen.getByText(/The VIP of Ana Hoxha \(WP-000001\) is up for review on 2027-01-31/));

    expect(mockNavigate).toHaveBeenCalledWith('/acme/members/m1');
  });

  it('does not re-mark an already-read notification', async () => {
    setup([notification({ readAt: '2026-07-27T11:00:00.000Z' })], 0);

    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await userEvent.click(screen.getByText('Ada Lovelace assigned Acme Corp to you'));

    expect(markRead).not.toHaveBeenCalled();
  });

  it('offers mark-all only when something is unread', async () => {
    const { unmount } = setup([notification()], 1);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByText('Mark all as read')).toBeDefined();
    unmount();

    setup([notification({ readAt: 'x' })], 0);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.queryByText('Mark all as read')).toBeNull();
  });

  it('shows an empty state rather than a blank panel', async () => {
    setup([], 0);

    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));

    expect(screen.getByText("You're all caught up.")).toBeDefined();
  });

  it('closes on Escape', async () => {
    setup([notification()], 1);
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByText('Notifications')).toBeDefined();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('renders an unknown type as its key instead of an empty row', async () => {
    setup([notification({ type: 'SOMETHING_NEW', params: {} })], 1);

    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));

    // A notification that arrived is evidence of something; dropping it
    // silently would hide a missing catalogue entry.
    expect(screen.getByText('SOMETHING_NEW')).toBeDefined();
  });
});
