import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNotificationText } from './useNotificationText';
import { useAuthStore } from '../store/useAuthStore';
import type { NotificationItem } from './useNotifications';

const staff = [{ id: 'u-a', firstName: 'Besa', lastName: 'Test', email: 'besa@example.com' }] as any;

const item = (overrides: Partial<NotificationItem>): NotificationItem => ({
  id: 'n1',
  type: 'DISCOUNT_APPROVAL_REQUESTED',
  params: {},
  actorUserId: 'u-a',
  entityType: 'OFFER',
  entityId: 'd1',
  readAt: null,
  createdAt: '2026-10-03T10:00:00Z',
  ...overrides,
});

describe('useNotificationText (M2 Slice 10)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { userId: 'u-m', email: 'm@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme', tenantCurrency: 'EUR', tenantLocale: 'en-US', permissions: {} },
      isAuthenticated: true,
    } as any);
  });

  it('FR-DSC-05 a discount request names the salesperson, company, list price, requested % and reason', () => {
    const { result } = renderHook(() => useNotificationText(staff));
    const text = result.current(
      item({
        params: { kind: 'DISCOUNT', reference: 'OF-2026-0001', clientName: 'Restorant Tirana', requestedPercent: '15.00', listPrice: '49.40', reason: 'Loyal customer' },
      })
    );
    expect(text).toBe('Besa Test requested a 15.00% discount on OF-2026-0001 (Restorant Tirana), list price €49.40. Reason: Loyal customer');
  });

  it('FR-PRC-09 a manual price request reads as one, with the price formatted', () => {
    const { result } = renderHook(() => useNotificationText(staff));
    const text = result.current(
      item({
        params: { kind: 'MANUAL_PRICE', reference: 'OF-2026-0002', clientName: 'Kafe Blloku', requestedMonthlyPrice: '300.00', reason: 'Large site' },
      })
    );
    expect(text).toBe('Besa Test proposed a manual price of €300.00 on OF-2026-0002 (Kafe Blloku). Reason: Large site');
  });
});
