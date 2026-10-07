/** dd.mm.yyyy, whatever the visitor's locale (FR-CRD-01). */
export const formatCardDate = (key: string): string => {
  const [year, month, day] = key.split('-');
  return `${day}.${month}.${year}`;
};

/** Black or white text, whichever reads better on the tier colour. */
export const readableOn = (hex: string): '#000000' | '#ffffff' => {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '888888';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#000000' : '#ffffff';
};
