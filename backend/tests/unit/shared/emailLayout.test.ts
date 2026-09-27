import { renderEmailLayout } from '../../../src/shared/email/emailLayout';

const render = (over: Partial<Parameters<typeof renderEmailLayout>[0]> = {}) =>
  renderEmailLayout({
    appUrl: 'https://app.wellness.test',
    heading: 'Reset your password',
    bodyHtml: '<p>Body</p>',
    ...over,
  });

describe('renderEmailLayout', () => {
  it('FR-BR-01 heads every email with the Wellness Plus logo, served by the app', () => {
    const html = render();

    expect(html).toContain('src="https://app.wellness.test/email/wellness-plus-logo.png"');
    // Most clients block images until asked; the alt text is what shows then.
    expect(html).toContain('alt="Wellness Albania"');
  });

  it('FR-BR-04 signs off as Wellness Albania and never names Neva', () => {
    const html = render({ cta: { label: 'Open', url: 'https://app.wellness.test/x' } });

    expect(html).toContain('Wellness Albania');
    expect(html).not.toMatch(/neva/i);
  });

  it('FR-BR-02 draws the call to action in the brand teal, not the old indigo', () => {
    const html = render({ cta: { label: 'Reset password', url: 'https://app.wellness.test/r' } });

    expect(html).toContain('#047a68');
    expect(html).not.toMatch(/#4f46e5|#7c3aed/i);
  });

  it('does not double the slash when the app URL ends with one', () => {
    const html = render({ appUrl: 'https://app.wellness.test/' });

    expect(html).toContain('src="https://app.wellness.test/email/wellness-plus-logo.png"');
  });
});
