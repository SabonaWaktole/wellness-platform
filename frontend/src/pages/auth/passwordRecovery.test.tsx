import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { ResetPasswordPage } from './ResetPasswordPage';

const pages = [
  ['forgot-password', ForgotPasswordPage, '/forgot-password'],
  ['reset-password', ResetPasswordPage, '/reset-password?token=t0ken'],
] as const;

const renderAt = (Page: React.ComponentType, url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Page />
    </MemoryRouter>
  );

describe('password recovery pages', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it.each(pages)('FR-BR-03 brands the %s page with the Wellness Plus logo', (_, page, url) => {
    const { container } = renderAt(page, url);

    expect(screen.getByRole('img', { name: 'Wellness Albania' })).toBeTruthy();
    expect(container.textContent).not.toMatch(/neva/i);
  });

  it('FR-LNG-02 translates the way back to sign-in', async () => {
    // Was a hard-coded "Back to Login", so an Albanian visitor who had come
    // to recover their password was shown English on the way out.
    await i18n.changeLanguage('sq');
    renderAt(ForgotPasswordPage, '/forgot-password');

    expect(screen.getByRole('link', { name: 'Kthehu te hyrja' })).toBeTruthy();
  });
});
