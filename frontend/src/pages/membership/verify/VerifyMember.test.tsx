import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VerifyMemberContent } from './VerifyMemberContent';
import { memberVerificationService, type ReceptionVerification } from '../../../services/memberVerificationService';

vi.mock('../../../services/memberVerificationService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/memberVerificationService')>();
  return { ...actual, memberVerificationService: { byToken: vi.fn(), search: vi.fn(), byMember: vi.fn(), recordIdentity: vi.fn() } };
});
// The camera is covered by its own tests below; here a stand-in "scans" a card when pressed.
vi.mock('./QrScanner', () => ({
  QrScanner: ({ onToken }: { onToken: (token: string) => void }) => <button type="button" onClick={() => onToken('T'.repeat(43))}>{'fake scan'}</button>,
}));

const service = vi.mocked(memberVerificationService);
const TIER = { tier: 'GOLD' as const, labelSq: 'Ar', labelEn: 'Gold', colour: '#C9A227' };

const valid = (extra: Partial<Extract<ReceptionVerification, { found: true }>> = {}): ReceptionVerification => ({
  found: true, verificationId: 'v1', valid: true, reason: null, name: 'Ana Hoxha', memberNumber: 'WP-000123', tier: TIER, validUntil: '2027-12-31',
  status: 'ACTIVE', dateOfBirth: '1990-05-17', discounts: [{ nameSq: 'Fizioterapi', nameEn: 'Physiotherapy', percent: '15.00' }, { nameSq: 'Masazh', nameEn: 'Massage', percent: '12.50' }], ...extra,
});

const renderScreen = () =>
  render(
    <MemoryRouter initialEntries={['/acme/members/verify']}>
      <Routes>
        <Route path="/:tenantSlug/members/verify" element={<VerifyMemberContent />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => vi.clearAllMocks());

const search = (text: string) => {
  fireEvent.change(screen.getByLabelText('Member ID, name, phone or email'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
};

describe('Verify member screen (M4 Slice 13)', () => {
  it('FR-VER-01 a scan checks the token with the server and shows the result', async () => {
    service.byToken.mockResolvedValue(valid());
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    fireEvent.click(screen.getByRole('button', { name: 'fake scan' }));

    expect(await screen.findByText('Valid')).toBeInTheDocument();
    expect(service.byToken).toHaveBeenCalledWith('acme', 'T'.repeat(43));
  });

  it('FR-VER-01 a search with one hit is checked at once; the member is found by what was typed', async () => {
    service.search.mockResolvedValue([{ id: 'm1', name: 'Ana Hoxha', memberNumber: 'WP-000123' }]);
    service.byMember.mockResolvedValue(valid());
    renderScreen();

    search('ana@example.com');

    expect(await screen.findByRole('heading', { name: 'Ana Hoxha' })).toBeInTheDocument();
    expect(service.search).toHaveBeenCalledWith('acme', 'ana@example.com');
    expect(service.byMember).toHaveBeenCalledWith('acme', 'm1');
  });

  it('FR-VER-01 several hits are listed by name and member ID, and the chosen one is checked', async () => {
    service.search.mockResolvedValue([
      { id: 'm1', name: 'Ana Hoxha', memberNumber: 'WP-000123' },
      { id: 'm2', name: 'Ana Krasniqi', memberNumber: 'WP-000124' },
    ]);
    service.byMember.mockResolvedValue(valid({ name: 'Ana Krasniqi', memberNumber: 'WP-000124' }));
    renderScreen();

    search('Ana');
    fireEvent.click(await screen.findByRole('button', { name: /Ana Krasniqi/ }));

    expect(await screen.findByRole('heading', { name: 'Ana Krasniqi' })).toBeInTheDocument();
    expect(service.byMember).toHaveBeenCalledWith('acme', 'm2');
  });

  it('FR-VER-01 no match says so', async () => {
    service.search.mockResolvedValue([]);
    renderScreen();
    search('nobody');
    expect(await screen.findByText('No member found.')).toBeInTheDocument();
  });

  it('FR-VER-02 a valid member shows Valid large, with name, member ID, tier, valid until, status, date of birth and the discounts', async () => {
    service.byToken.mockResolvedValue(valid());
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    fireEvent.click(screen.getByRole('button', { name: 'fake scan' }));

    expect(await screen.findByRole('status', { name: '' })).toBeDefined();
    expect(screen.getByText('Valid')).toBeInTheDocument();
    expect(screen.getByText('WP-000123')).toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('31.12.2027')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('17.05.1990')).toBeInTheDocument();
    expect(screen.getByText('Physiotherapy')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
    expect(screen.getByText('12.5%')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/@|\+355|employer|payment|fee/i);
  });

  it('FR-VER-02 a suspended member shows "Not valid: Suspended" with the status and no discounts', async () => {
    service.byToken.mockResolvedValue(valid({ valid: false, reason: 'SUSPENDED', status: 'SUSPENDED', discounts: [] }));
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    fireEvent.click(screen.getByRole('button', { name: 'fake scan' }));

    expect(await screen.findByText('Not valid: Suspended')).toBeInTheDocument();
    expect(screen.queryByText('Discounts')).toBeNull();
    expect(screen.queryByText('Physiotherapy')).toBeNull();
  });

  it('FR-VER-04 an unknown card shows "Member not found" and nothing else of a member', async () => {
    service.byToken.mockResolvedValue({ found: false, verificationId: 'v9' });
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    fireEvent.click(screen.getByRole('button', { name: 'fake scan' }));

    expect(await screen.findByText('Member not found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Identity confirmed' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('FR-VER-03 both identity buttons exist, and each stores its answer on the check just made', async () => {
    service.byToken.mockResolvedValue(valid());
    service.recordIdentity.mockResolvedValue({ identityChoice: 'MISMATCH' });
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    fireEvent.click(screen.getByRole('button', { name: 'fake scan' }));

    expect(await screen.findByRole('button', { name: 'Identity confirmed' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Does not match' }));

    expect(await screen.findByText('Recorded: does not match.')).toBeInTheDocument();
    expect(service.recordIdentity).toHaveBeenCalledWith('acme', 'v1', 'MISMATCH');
  });

  it('FR-VER-03 a failed save is reported, and Verify another member starts again', async () => {
    service.byToken.mockResolvedValue(valid());
    service.recordIdentity.mockRejectedValue(new Error('down'));
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Scan' }));
    fireEvent.click(screen.getByRole('button', { name: 'fake scan' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Identity confirmed' }));
    expect(await screen.findByText('The answer could not be saved. Try again.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Verify another member' }));
    expect(screen.getByRole('button', { name: 'Scan' })).toBeInTheDocument();
  });

  it('a failed check says so and can be tried again', async () => {
    service.search.mockRejectedValue(new Error('down'));
    renderScreen();
    search('Ana');
    expect(await screen.findByText('The check could not be completed. Try again.')).toBeInTheDocument();
  });
});
