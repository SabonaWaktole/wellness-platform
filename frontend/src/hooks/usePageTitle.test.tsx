import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageTitle } from './usePageTitle';

describe('usePageTitle', () => {
  beforeEach(() => {
    document.title = '';
  });

  it('FR-BR-04 names the product when the page gives no title of its own', () => {
    renderHook(() => usePageTitle());

    expect(document.title).toBe('Wellness Albania');
  });

  it('FR-BR-04 puts the page first and the product after it', () => {
    // Page first so the part that differs between tabs is the part a
    // truncated tab still shows.
    renderHook(() => usePageTitle('Mirë se u ktheve'));

    expect(document.title).toBe('Mirë se u ktheve · Wellness Albania');
  });

  it('follows the title when the page changes it', () => {
    const { rerender } = renderHook(({ title }) => usePageTitle(title), {
      initialProps: { title: 'Rivendosni fjalëkalimin' },
    });

    rerender({ title: 'Krijoni fjalëkalim të ri' });

    expect(document.title).toBe('Krijoni fjalëkalim të ri · Wellness Albania');
  });
});
