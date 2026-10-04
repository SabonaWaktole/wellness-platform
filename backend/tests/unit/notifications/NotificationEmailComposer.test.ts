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

  const followUp = (type: 'FOLLOW_UP_DUE' | 'FOLLOW_UP_ASSIGNED' | 'FOLLOW_UP_DAILY_SUMMARY', language: string | null, params: object = {}) =>
    composer.compose({
      type,
      params: { clientName: 'Kafe Blloku', scheduledAt: '2026-10-08T07:00:00.000Z', followUpType: 'CALL', ...params },
      tenantName: 'Wellness Albania',
      tenantSlug: 'wellness-albania',
      entityType: type === 'FOLLOW_UP_DAILY_SUMMARY' ? null : 'FOLLOW_UP',
      entityId: type === 'FOLLOW_UP_DAILY_SUMMARY' ? null : 'fu-1',
      language,
    });

  it('FR-FUP-09 a due follow-up names the company and opens it in "My follow-ups", in the recipient\'s language', () => {
    const en = followUp('FOLLOW_UP_DUE', 'en');
    expect(en.subject).toContain('Your follow-up with Kafe Blloku is due');
    expect(en.html).toContain('https://app.wellness.test/wellness-albania/follow-ups?open=fu-1');
    expect(followUp('FOLLOW_UP_DUE', 'sq').subject).toContain('Ndjekja me Kafe Blloku është për tani');
  });

  it('FR-FUP-09 the daily summary counts the day and the overdue, and opens the list', () => {
    const email = followUp('FOLLOW_UP_DAILY_SUMMARY', 'en', { day: '2026-10-08', today: 3, overdue: 1 });
    expect(email.subject).toContain("Today's follow-ups: 3");
    expect(email.html).toContain('<strong>1</strong> overdue');
    expect(email.html).toContain('https://app.wellness.test/wellness-albania/follow-ups');
  });

  it('FR-FUP-10 a follow-up given to someone names the company', () => {
    expect(followUp('FOLLOW_UP_ASSIGNED', 'sq').subject).toContain('Ju u caktua një ndjekje me Kafe Blloku');
  });
});
