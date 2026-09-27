import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reads the design tokens as written, so the palette is checked as shipped
 * rather than as someone remembers it. The light theme is `:root`; the dark
 * theme is `.dark` layered over it.
 */
const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function declarations(selector: string): Record<string, string> {
  const block = css.match(new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!block) throw new Error(`No ${selector} block in tokens.css`);
  const out: Record<string, string> = {};
  for (const [, name, value] of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

const light = declarations(':root');
const dark = { ...light, ...declarations('.dark') };

function resolve(theme: Record<string, string>, name: string): string {
  let value = theme[name];
  for (let depth = 0; value?.startsWith('var('); depth++) {
    if (depth > 10) throw new Error(`var() cycle at ${name}`);
    value = theme[value.slice(4, -1).split(',')[0].trim()];
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`${name} does not resolve to a #rrggbb colour (got ${value})`);
  }
  return value.toLowerCase();
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

/** Text token → the surfaces it is set on. Every pair must reach WCAG AA. */
const TEXT_PAIRS: Array<[string, string[]]> = [
  ['--text-primary', ['--color-background', '--color-surface', '--color-surface-container']],
  ['--text-secondary', ['--color-background', '--color-surface']],
  ['--color-on-primary', ['--color-primary', '--color-primary-hover', '--color-primary-active']],
  ['--color-on-primary-container', ['--color-primary-container']],
  ['--color-on-secondary', ['--color-secondary']],
  ['--color-on-secondary-container', ['--color-secondary-container']],
  ['--color-on-success', ['--color-success']],
  ['--color-on-success-container', ['--color-success-container']],
  ['--color-on-error-container', ['--color-error-container']],
  ['--color-on-warning-container', ['--color-warning-container']],
  // Links and accent-coloured labels sit directly on the page.
  ['--color-primary', ['--color-background', '--color-surface']],
  ['--color-success', ['--color-surface']],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme', (_, theme) => {
  it.each(TEXT_PAIRS)('FR-BR-02 keeps %s legible at WCAG AA', (text, surfaces) => {
    for (const surface of surfaces) {
      const ratio = contrast(resolve(theme, text), resolve(theme, surface));
      expect(ratio, `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('FR-BR-02 takes the accent from the brand teal', () => {
    // A darker or lighter step is allowed (the logo teal cannot carry white
    // text); a different hue is not.
    const drift = Math.abs(hue(resolve(theme, '--color-primary')) - hue(resolve(theme, '--brand-teal')));
    expect(drift).toBeLessThan(10);
  });
});

describe('brand palette', () => {
  it('FR-BR-02 carries the four logo colours from SRS §3.1', () => {
    expect(resolve(light, '--brand-navy')).toBe('#0b2b42');
    expect(resolve(light, '--brand-teal')).toBe('#04a68c');
    expect(resolve(light, '--brand-blue-teal')).toBe('#048e9c');
    expect(resolve(light, '--brand-green')).toBe('#3daa6c');
  });

  it('FR-BR-02 sets primary text and headings in the brand navy', () => {
    expect(resolve(light, '--text-primary')).toBe('#0b2b42');
  });
});
