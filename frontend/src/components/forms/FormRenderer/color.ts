/**
 * Contrast helpers for tenant-chosen accent colours.
 *
 * A business owner picks one hex value, but the app renders in both light and
 * dark themes — so a colour that reads well against one surface can be
 * invisible against the other. Nothing here changes the owner's colour; it
 * decides what to put ON it, and lets the builder warn when a choice will not
 * survive one of the two themes.
 */

const clampChannel = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const parseHex = (hex: string): [number, number, number] | null => {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
};

/** WCAG relative luminance. */
export const relativeLuminance = (hex: string): number | null => {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(clampChannel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a: string, b: string): number | null => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
};

/** Black or white, whichever is legible on the given fill. */
export const readableTextOn = (hex: string): string => {
  const luminance = relativeLuminance(hex);
  if (luminance === null) return '#111111';
  return luminance > 0.5 ? '#111111' : '#ffffff';
};

/** The two surfaces an accent has to survive: the light and dark page grounds. */
export const LIGHT_SURFACE = '#ffffff';
/** --color-surface under `prefers-color-scheme: dark` in styles/tokens.css. */
export const DARK_SURFACE = '#131316';

/**
 * Whether an accent stays visible in BOTH themes.
 *
 * 3:1 is the WCAG threshold for non-text graphics, which is what an accent is
 * here — it draws rules, badges and focus rings, never body text. Checking both
 * surfaces matters because the owner is choosing one colour for two
 * backgrounds and only ever sees the theme they happen to be in.
 */
export const accentContrastWarning = (
  hex: string
): { theme: 'light' | 'dark'; ratio: number } | null => {
  const light = contrastRatio(hex, LIGHT_SURFACE);
  const dark = contrastRatio(hex, DARK_SURFACE);
  if (light === null || dark === null) return null;
  if (light < 3) return { theme: 'light', ratio: light };
  if (dark < 3) return { theme: 'dark', ratio: dark };
  return null;
};
