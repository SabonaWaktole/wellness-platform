import { describe, it, expect } from 'vitest';
import { roleLabel } from './roleLabel';

describe('roleLabel (FR-LNG-03)', () => {
  const reception = { nameSq: 'Recepsion', nameEn: 'Reception' };

  it('uses the Albanian name in Albanian and the English name otherwise', () => {
    expect(roleLabel(reception, 'sq')).toBe('Recepsion');
    expect(roleLabel(reception, 'en')).toBe('Reception');
    expect(roleLabel(reception, 'it')).toBe('Reception');
  });

  it('falls back to the Albanian name when a role has no English one', () => {
    expect(roleLabel({ nameSq: 'Shitës i ri', nameEn: '' }, 'en')).toBe('Shitës i ri');
  });
});
