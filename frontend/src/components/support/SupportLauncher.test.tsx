import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useSupportStore } from '../../store/useSupportStore';
import { SupportLauncher } from './SupportLauncher';

const mount = (path = '/acme/clients') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SupportLauncher className="header-icon" />
    </MemoryRouter>,
  );

afterEach(() => act(() => useSupportStore.getState().closePanel()));

describe('SUP-01 SUP-14 SupportLauncher', () => {
  it('SUP-14 is a real button named Help, which announces that it opens a dialog', () => {
    mount();
    const button = screen.getByRole('button', { name: 'Help' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('SUP-01 keeps the layout class it is given, so the header still lays it out', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Help' })).toHaveClass('header-icon');
  });

  it('SUP-01 clicking it opens the panel, and aria-expanded follows', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(useSupportStore.getState().panelOpen).toBe(true);
    expect(screen.getByRole('button', { name: 'Help' })).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('SUP-01 clicking it again closes the panel', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(useSupportStore.getState().panelOpen).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('SUP-19 renders no panel, and loads none, until it is opened', () => {
    mount();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('SUP-01 opens the same panel when something else (the sidebar item) opens it', async () => {
    mount();
    act(() => useSupportStore.getState().openPanel());
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
