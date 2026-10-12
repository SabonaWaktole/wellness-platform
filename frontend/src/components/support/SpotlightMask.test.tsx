import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockRect } from '../../mocks/mockRect';
import { SpotlightMask } from './SpotlightMask';

const frame = () => act(async () => void (await new Promise((r) => requestAnimationFrame(() => r(null)))));
const part = (name: string) => document.body.querySelector(`[data-spotlight="${name}"]`) as HTMLElement;

const created: Element[] = [];
const target = (rect = { top: 100, left: 100, width: 120, height: 32 }) => {
  const node = document.createElement('button');
  document.body.append(node);
  created.push(node);
  return mockRect(node, rect);
};

afterEach(() => {
  created.splice(0).forEach((node) => node.remove());
  vi.unstubAllGlobals();
});

describe('SUP-02 SUP-15 spotlight mask', () => {
  it('SUP-15 renders nothing without a target', () => {
    render(<SpotlightMask element={null} />);
    expect(document.body.querySelector('[data-spotlight]')).toBeNull();
  });

  it('SUP-02 the hole equals the padded rect: four panels around it and a ring on it', () => {
    render(<SpotlightMask element={target()} padding={4} />);
    expect(part('ring').style).toMatchObject({ top: '96px', left: '96px', width: '128px', height: '40px' });
    expect(part('top').style).toMatchObject({ top: '0px', left: '0px', height: '96px' });
    expect(part('bottom').style.top).toBe('136px');
    expect(part('left').style).toMatchObject({ top: '96px', width: '96px', height: '40px' });
    expect(part('right').style).toMatchObject({ top: '96px', left: '224px', height: '40px' });
  });

  it('SUP-15 follows scroll and resize', async () => {
    const node = target();
    render(<SpotlightMask element={node} padding={0} />);
    mockRect(node, { top: 300, left: 50, width: 60, height: 20 });
    window.dispatchEvent(new Event('scroll'));
    await frame();
    expect(part('ring').style).toMatchObject({ top: '300px', left: '50px' });
    mockRect(node, { top: 310, left: 60, width: 70, height: 20 });
    window.dispatchEvent(new Event('resize'));
    await frame();
    expect(part('ring').style).toMatchObject({ top: '310px', left: '60px', width: '70px' });
  });

  it('SUP-15 re-binds to a replacement element', () => {
    const first = target();
    const { rerender } = render(<SpotlightMask element={first} padding={0} />);
    rerender(<SpotlightMask element={target({ top: 5, left: 6, width: 7, height: 8 })} padding={0} />);
    expect(part('ring').style).toMatchObject({ top: '5px', left: '6px', width: '7px', height: '8px' });
  });

  it('SUP-02 is hidden from assistive technology and never takes pointer events', () => {
    render(<SpotlightMask element={target()} />);
    const root = part('ring').parentElement as HTMLElement;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.style.pointerEvents).toBe('none');
  });

  it('SUP-02 is portalled to the body, outside the page markup', () => {
    const { container } = render(<SpotlightMask element={target()} />);
    expect(container.querySelector('[data-spotlight]')).toBeNull();
    expect(part('ring').closest('body')).not.toBeNull();
  });
});

describe('SUP-16 spotlight mask: motion and forced colors', () => {
  const stubMotion = (noPreference: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('no-preference') ? noPreference : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

  it('SUP-16 animates only when the user has no reduced motion preference', () => {
    stubMotion(true);
    const { unmount } = render(<SpotlightMask element={target()} />);
    expect(part('ring').parentElement?.dataset.animated).toBe('true');
    unmount();
    stubMotion(false);
    render(<SpotlightMask element={target()} />);
    expect(part('ring').parentElement?.dataset.animated).toBe('false');
  });

  it('SUP-16 does not animate when motion preference is unknown', () => {
    render(<SpotlightMask element={target()} />);
    expect(part('ring').parentElement?.dataset.animated).toBe('false');
  });

  const css = readFileSync(resolve(__dirname, 'SpotlightMask.module.css'), 'utf8');

  it('SUP-16 the stylesheet drops the dim and uses system colors under forced-colors', () => {
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toMatch(/Highlight/);
    expect(css).toMatch(/CanvasText/);
  });

  it('SUP-16 the stylesheet takes pointer events away and sits on the tour layer', () => {
    expect(css).toContain('pointer-events: none');
    expect(css).toContain('var(--z-tour)');
  });

  it('SUP-16 the token exceeds the impersonation banner', () => {
    const tokens = readFileSync(resolve(__dirname, '..', '..', 'styles', 'tokens.css'), 'utf8');
    const z = Number(/--z-tour:\s*(\d+)/.exec(tokens)?.[1]);
    expect(z).toBeGreaterThan(1000);
  });
});
