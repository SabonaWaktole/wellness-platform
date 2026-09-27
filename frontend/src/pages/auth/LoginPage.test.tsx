import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import { LoginPage } from './LoginPage';
import { useThemeStore } from '../../store/useThemeStore';

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>
  );

describe('LoginPage', () => {
  beforeEach(() => {
    useThemeStore.setState({ resolved: 'light', preference: 'system' });
    document.title = '';
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('FR-BR-01 shows the Wellness Plus logo', () => {
    renderLogin();

    const logo = screen.getByRole('img', { name: 'Wellness Albania' });
    expect(logo.getAttribute('src')).toMatch(/wellness-plus-logo\.png$/);
  });

  it('FR-BR-04 never names Neva', () => {
    const { container } = renderLogin();

    expect(container.textContent).not.toMatch(/neva/i);
    for (const image of container.querySelectorAll('img')) {
      expect(image.getAttribute('alt') ?? '').not.toMatch(/neva/i);
      expect(image.getAttribute('src') ?? '').not.toMatch(/neva/i);
    }
  });

  it('FR-BR-04 names the page and the product in the browser tab', () => {
    renderLogin();

    expect(document.title).toBe('Welcome back · Wellness Albania');
  });

  it('FR-BR-03 introduces the product by name', () => {
    renderLogin();

    expect(screen.getByText('Sign in to your Wellness Albania account')).toBeTruthy();
  });

  it('FR-LNG-01 greets a visitor in Albanian, including the theme menu', async () => {
    await i18n.changeLanguage('sq');
    renderLogin();

    expect(screen.getByRole('heading', { name: 'Mirë se u ktheve' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hyr' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Tema: / })).toBeTruthy();
    expect(document.title).toBe('Mirë se u ktheve · Wellness Albania');
  });
});
