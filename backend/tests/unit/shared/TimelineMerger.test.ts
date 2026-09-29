import { TimelineMerger } from '../../../src/shared/application/TimelineMerger';
import { InvalidTimelineCursorError, TimelineEntry } from '../../../src/shared/application/timeline/TimelineEntry';

const entry = (id: string, timestamp: string, category: TimelineEntry['category'] = 'NOTE'): TimelineEntry => ({
  id,
  category,
  type: 'X',
  timestamp,
  actorId: null,
  details: {},
});

describe('TimelineMerger.page', () => {
  const entries = [
    entry('note:1', '2026-01-01T10:00:00.000Z', 'NOTE'),
    entry('contract:1', '2026-01-03T10:00:00.000Z', 'CONTRACT'),
    entry('contact-added:1', '2026-01-02T10:00:00.000Z', 'CONTACT'),
    entry('quotation:1', '2026-01-04T10:00:00.000Z', 'QUOTATION'),
  ];

  it('FR-CMP-05 merges entries from every source newest first', () => {
    const { entries: page, nextCursor } = TimelineMerger.page(entries, { limit: 10 });

    expect(page.map((e) => e.id)).toEqual(['quotation:1', 'contract:1', 'contact-added:1', 'note:1']);
    expect(nextCursor).toBeNull();
  });

  it('FR-CMP-05 filters by type', () => {
    const { entries: page } = TimelineMerger.page(entries, { types: ['CONTRACT', 'NOTE'], limit: 10 });

    expect(page.map((e) => e.id)).toEqual(['contract:1', 'note:1']);
  });

  it('FR-CMP-05 an empty type list means every type', () => {
    const { entries: page } = TimelineMerger.page(entries, { types: [], limit: 10 });

    expect(page).toHaveLength(4);
  });

  it('FR-CMP-05 walks every entry exactly once across pages, including equal timestamps', () => {
    const same = '2026-02-01T00:00:00.000Z';
    const many = [
      ...entries,
      entry('a', same),
      entry('b', same),
      entry('c', same),
      entry('d', same, 'CONTACT'),
    ];

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const { entries: page, nextCursor } = TimelineMerger.page(many, { cursor, limit: 3 });
      seen.push(...page.map((e) => e.id));
      if (!nextCursor) break;
      cursor = nextCursor;
    }

    expect(seen).toHaveLength(many.length);
    expect(new Set(seen).size).toBe(many.length);
    expect(seen.slice(0, 4)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('gives no next cursor when the last page is exactly full', () => {
    const { nextCursor } = TimelineMerger.page(entries, { limit: 4 });

    expect(nextCursor).toBeNull();
  });

  it('rejects a malformed cursor', () => {
    expect(() => TimelineMerger.page(entries, { cursor: 'not-a-cursor', limit: 3 })).toThrow(InvalidTimelineCursorError);
    const badDate = Buffer.from('yesterday|note:1').toString('base64url');
    expect(() => TimelineMerger.page(entries, { cursor: badDate, limit: 3 })).toThrow(InvalidTimelineCursorError);
  });
});
