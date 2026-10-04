import { NotificationEmailComposer } from '../../../src/notifications/application/NotificationEmailComposer';

describe('NotificationEmailComposer', () => {
  const composer = new NotificationEmailComposer('https://app.wellness.test');

  it('FR-BR-04 invites the reader back into Wellness Albania, never Neva', () => {
    const email = composer.compose({
      type: 'QUOTATION_SUBMITTED_FOR_APPROVAL',
      params: { reference: 'Q-0001' },
      tenantName: 'Wellness Albania',
      tenantSlug: 'wellness-albania',
      entityType: 'QUOTATION',
      entityId: 'q1',
    });

    expect(email.html).toContain('Open in Wellness Albania');
    expect(email.html).not.toMatch(/neva/i);
    expect(email.subject).not.toMatch(/neva/i);
  });

  it('FR-BR-01 carries the Wellness Plus logo', () => {
    const email = composer.compose({
      type: 'QUOTATION_SUBMITTED_FOR_APPROVAL',
      params: { reference: 'Q-0001' },
      tenantName: 'Wellness Albania',
      tenantSlug: 'wellness-albania',
      entityType: 'QUOTATION',
      entityId: 'q1',
    });

    expect(email.html).toContain('src="https://app.wellness.test/email/wellness-plus-logo.png"');
  });

  const request = (language: string | null, params: Record<string, string> = {}) =>
    composer.compose({
      type: 'DISCOUNT_APPROVAL_REQUESTED',
      params: {
        kind: 'DISCOUNT',
        reference: 'OF-2026-0001',
        clientName: 'Restorant Tirana',
        salespersonName: 'Besa Test',
        requestedPercent: '15.00',
        listPrice: '49.40',
        reason: 'Loyal customer',
        offerId: 'offer-1',
        dealId: 'deal-1',
        ...params,
      },
      tenantName: 'Wellness Albania',
      tenantSlug: 'wellness-albania',
      entityType: 'OFFER',
      entityId: 'deal-1',
      language,
    });

  it('FR-DSC-05 a discount request names the salesperson, the company and the percent, and opens the offer', () => {
    const email = request('en');
    expect(email.subject).toContain('Discount 15.00% on OF-2026-0001 needs your approval');
    expect(email.html).toContain('Besa Test');
    expect(email.html).toContain('Restorant Tirana');
    expect(email.html).toContain('https://app.wellness.test/wellness-albania/deals/deal-1?offer=offer-1');
    // Figures and free text beyond the percent stay behind the link.
    expect(email.html).not.toContain('49.40');
    expect(email.html).not.toContain('Loyal customer');
  });

  it('FR-DSC-05 NFR-I18N-02 the discount emails follow the recipient\'s language', () => {
    const email = request('sq');
    expect(email.subject).toContain('Zbritja 15.00% për OF-2026-0001 pret miratimin tuaj');
    expect(email.html).toContain('Hape në Wellness Albania');
    expect(email.html).toContain('lang="sq"');
    expect(request(null).subject).toContain('needs your approval');
  });

  it('FR-PRC-09 a manual price request reads as one', () => {
    expect(request('en', { kind: 'MANUAL_PRICE', requestedMonthlyPrice: '300.00' }).subject).toContain(
      'A manual price on OF-2026-0001 needs your approval'
    );
    expect(request('sq', { kind: 'MANUAL_PRICE' }).subject).toContain('Një çmim manual për OF-2026-0001 pret miratimin tuaj');
  });
});
