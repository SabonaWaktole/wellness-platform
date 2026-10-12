import { describe, expect, it } from 'vitest';
import { describeTarget } from './describeTarget';

const button = (describedBy?: string) => {
  const node = document.createElement('button');
  if (describedBy !== undefined) node.setAttribute('aria-describedby', describedBy);
  return node;
};

describe('SUP-14 describeTarget', () => {
  it('SUP-14 gives an undescribed control the explanation as its description', () => {
    const node = button();
    describeTarget(node, 'tour-body');
    expect(node.getAttribute('aria-describedby')).toBe('tour-body');
  });

  it('SUP-14 appends to an existing description instead of replacing it', () => {
    const node = button('hint help');
    describeTarget(node, 'tour-body');
    expect(node.getAttribute('aria-describedby')).toBe('hint help tour-body');
  });

  it('SUP-14 removes the attribute again when there was none', () => {
    const node = button();
    describeTarget(node, 'tour-body')();
    expect(node.hasAttribute('aria-describedby')).toBe(false);
  });

  it('SUP-14 restores the exact previous value, spacing included', () => {
    const node = button('  hint   help ');
    describeTarget(node, 'tour-body')();
    expect(node.getAttribute('aria-describedby')).toBe('  hint   help ');
  });

  it('SUP-14 restores an empty value as empty, not absent', () => {
    const node = button('');
    describeTarget(node, 'tour-body')();
    expect(node.getAttribute('aria-describedby')).toBe('');
  });

  it('SUP-14 does not list the id twice', () => {
    const node = button('tour-body');
    describeTarget(node, 'tour-body');
    expect(node.getAttribute('aria-describedby')).toBe('tour-body');
  });

  it('SUP-14 cleanup is safe to call twice', () => {
    const node = button('hint');
    const cleanup = describeTarget(node, 'tour-body');
    cleanup();
    node.setAttribute('aria-describedby', 'changed later');
    cleanup();
    expect(node.getAttribute('aria-describedby')).toBe('changed later');
  });
});
