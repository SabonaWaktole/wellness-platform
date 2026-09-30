import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { useThemeStore } from '../../../store/useThemeStore';

const renderShell = () =>
  render(
    <MemoryRouter>
      <AppLayout userName="Ana Hoxha">
        <div data-testid="page" />
      </AppLayout>
    </MemoryRouter>
  );

describe('AppLayout branding', () => {
  beforeEach(() => {
    useThemeStore.setState({ resolved: 'light' });
    document.title = '';
  });

  it('FR-BR-01, UAT-4 shows the Wellness Plus logo in the application header', () => {
    renderShell();

    const logo = screen.getByRole('img', { name: 'Wellness Albania' });
    expect(logo.getAttribute('src')).toMatch(/wellness-plus-logo\.png$/);
  });

  it('FR-BR-01 collapses to the leaf-and-cross symbol on a narrow screen', () => {
    renderShell();

    // One image for both widths: the browser picks the symbol below the
    // breakpoint, so the header never holds two copies of the brand.
    const logo = screen.getByRole('img', { name: 'Wellness Albania' });
    const narrowSource = logo.closest('picture')?.querySelector('source');
    expect(narrowSource?.getAttribute('media')).toMatch(/max-width/);
    expect(narrowSource?.getAttribute('srcset')).toMatch(/wellness-plus-mark\.png$/);
  });

  it('FR-BR-01 uses the light-text logo on the dark theme', () => {
    useThemeStore.setState({ resolved: 'dark' });
    renderShell();

    const logo = screen.getByRole('img', { name: 'Wellness Albania' });
    expect(logo.getAttribute('src')).toMatch(/wellness-plus-logo-dark\.png$/);
  });

  it('FR-BR-04 never names Neva in the header', () => {
    const { container } = renderShell();

    expect(container.textContent).not.toMatch(/neva/i);
    for (const image of container.querySelectorAll('img')) {
      expect(image.getAttribute('alt') ?? '').not.toMatch(/neva/i);
      expect(image.getAttribute('src') ?? '').not.toMatch(/neva/i);
    }
  });

  it('FR-BR-04 names the product in the browser tab', () => {
    renderShell();

    expect(document.title).toBe('Wellness Albania');
  });
});
