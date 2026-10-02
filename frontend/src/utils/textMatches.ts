/** One character as search compares it: lower case, without its accent (ç → c, ë → e). */
const fold = (char: string) => char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Where `query` occurs in `text`, as [start, end) offsets into `text`,
 * ignoring case and diacritics, so a salesperson typing "cmim" on a keyboard
 * without ç still finds "çmim" (FR-SCR-08). Matches do not overlap. A blank
 * query matches nothing.
 */
export function textMatches(text: string, query: string): Array<[number, number]> {
  const needle = Array.from(query.trim()).map(fold).join('');
  if (!needle) return [];

  // The folded text, and for each of its code units the offset in `text` of
  // the character it came from, so a match maps back to the original.
  let folded = '';
  const origin: number[] = [];
  let offset = 0;
  for (const char of Array.from(text)) {
    const piece = fold(char);
    for (let i = 0; i < piece.length; i += 1) origin.push(offset);
    folded += piece;
    offset += char.length;
  }
  origin.push(text.length);

  const matches: Array<[number, number]> = [];
  let from = folded.indexOf(needle);
  while (from !== -1) {
    const to = from + needle.length;
    matches.push([origin[from], origin[to]]);
    from = folded.indexOf(needle, to);
  }
  return matches;
}
