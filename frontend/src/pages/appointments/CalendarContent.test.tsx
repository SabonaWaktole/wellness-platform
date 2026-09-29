import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CalendarContent } from './CalendarContent';
import { useAppointmentsByDateRange, useRescheduleAppointment } from '../../hooks/useAppointments';
import { useAuthStore } from '../../store/useAuthStore';

vi.mock('../../hooks/useAppointments', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/useAppointments')>('../../hooks/useAppointments');
  return {
    ...actual,
    useAppointmentsByDateRange: vi.fn(),
    useRescheduleAppointment: vi.fn(),
  };
});

const setTenant = (tenantLocale: string, tenantTimezone: string) => {
  useAuthStore.setState({
    user: {
      userId: 'u1',
      email: 'owner@example.com',
      role: 'BUSINESS_OWNER',
      tenantId: 't1',
      tenantSlug: 'acme',
      tenantLocale,
      tenantTimezone,
    },
    isAuthenticated: true,
  });
};

describe('FR-LNG-04 CalendarContent date formatting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAppointmentsByDateRange as any).mockReturnValue({
      appointments: [],
      isLoading: false,
      error: null,
      updateAppointmentLocally: vi.fn(),
    });
    (useRescheduleAppointment as any).mockReturnValue({
      rescheduleAppointment: vi.fn(),
      isLoading: false,
    });
  });

  it('renders the month header in the workspace locale, not the browser default', () => {
    setTenant('de-DE', 'UTC');
    render(
      <MemoryRouter>
        <CalendarContent />
      </MemoryRouter>
    );

    const expected = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date());
    expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
  });

  it('switches the month header language when the workspace locale changes', () => {
    setTenant('en-US', 'UTC');
    render(
      <MemoryRouter>
        <CalendarContent />
      </MemoryRouter>
    );

    const expectedEn = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
    const expectedDe = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date());
    expect(screen.getAllByText(expectedEn).length).toBeGreaterThan(0);
    if (expectedEn !== expectedDe) {
      expect(screen.queryByText(expectedDe)).not.toBeInTheDocument();
    }
  });
});
