import { describe, it, expect } from 'vitest';
import { DATE_FORMATS } from './useTenantSettings';
import { DATE_FORMAT_PATTERNS } from '../utils/dateFormatPattern';
import { DATE_FORMAT_LABELS } from '../constants/workspaceSettingsOptions';

describe('workspace date formats', () => {
  it('FR-LNG-04 offers the Albanian day.month.year format', () => {
    expect(DATE_FORMATS).toContain('DD.MM.YYYY');
    expect(DATE_FORMAT_LABELS['DD.MM.YYYY']).toContain('13.08.2026');
  });

  it('offers exactly the formats the formatter can write', () => {
    // Two lists, one in the settings form and one in the formatter: a format
    // added to only one would be selectable but silently printed month-first.
    expect([...DATE_FORMATS]).toEqual([...DATE_FORMAT_PATTERNS]);
  });
});
