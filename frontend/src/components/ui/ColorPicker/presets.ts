/**
 * Every preset clears 3:1 against BOTH page grounds (#ffffff and #131316), so
 * picking one never trips the contrast warning in ColorPicker. That is the whole point
 * of having presets: a tenant who does not want to think about theming should
 * not be able to choose a colour that vanishes for half their readers.
 *
 * Verified values (light / dark): 5.17/3.59, 3.74/4.95, 3.30/5.63, 3.19/5.82,
 * 4.83/3.84, 5.38/3.45, 4.76/3.90.
 */
export const PRESET_SWATCHES = [
  '#2563eb',
  '#0d9488',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#9333ea',
  '#64748b',
] as const;
