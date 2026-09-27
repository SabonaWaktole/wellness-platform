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
});
