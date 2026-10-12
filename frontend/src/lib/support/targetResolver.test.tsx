import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { mockRect } from '../../mocks/mockRect';
import { isBusy, isDisabled, isVisible, resolveTarget, scopeRoot } from './targetResolver';

const el = (container: HTMLElement, testId: string) => container.querySelector(`[data-testid="${testId}"]`) as HTMLElement;
const show = <T extends HTMLElement>(node: T) => mockRect(node);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('SUP-06 target resolver: status of one target', () => {
  it('SUP-06 reports missing when nothing carries the token', () => {
    render(<main />);
    expect(resolveTarget({ id: 'page.add' })).toMatchObject({ element: null, status: 'missing' });
  });

  it('SUP-06 reports found for a connected, laid out element', () => {
    const { container } = render(
      <main>
        <button data-tour="page.add" data-testid="add">Add</button>
      </main>,
    );
    const add = show(el(container, 'add'));
    expect(resolveTarget({ id: 'page.add' })).toEqual({ element: add, status: 'found', count: 1 });
  });

  it('SUP-06 an element that is not laid out is not found', () => {
    render(
      <main>
        <button data-tour="page.add">Add</button>
      </main>,
    );
    expect(resolveTarget({ id: 'page.add' }).status).toBe('missing');
  });

  it('SUP-06 an element inside aria-hidden is not found', () => {
    const { container } = render(
      <main>
        <div aria-hidden="true">
          <button data-tour="page.add" data-testid="add">Add</button>
        </div>
      </main>,
    );
    show(el(container, 'add'));
    expect(resolveTarget({ id: 'page.add' }).status).toBe('missing');
  });

  it('SUP-06 an element with the hidden attribute is not found', () => {
    const { container } = render(
      <main>
        <button data-tour="page.add" data-testid="add" hidden>Add</button>
      </main>,
    );
    show(el(container, 'add'));
    expect(resolveTarget({ id: 'page.add' }).status).toBe('missing');
  });

  it.each([
    ['disabled', { disabled: true }],
    ['aria-disabled', { 'aria-disabled': 'true' }],
  ])('SUP-06 a %s element is reported disabled but still returned', (_name, attrs) => {
    const { container } = render(
      <main>
        <button data-tour="page.add" data-testid="add" {...attrs}>Add</button>
      </main>,
    );
    const add = show(el(container, 'add'));
    expect(resolveTarget({ id: 'page.add' })).toMatchObject({ element: add, status: 'disabled' });
    expect(isDisabled(add)).toBe(true);
  });

  it('SUP-06 an element outside the viewport is reported offscreen', () => {
    const { container } = render(
      <main>
        <button data-tour="page.add" data-testid="add">Add</button>
      </main>,
    );
    mockRect(el(container, 'add'), { top: window.innerHeight + 500, left: 10, width: 100, height: 30 });
    expect(resolveTarget({ id: 'page.add' }).status).toBe('offscreen');
  });

  it('SUP-08 reports pending while a busy region may still render the target', () => {
    const { container } = render(
      <main>
        <section aria-busy="true" data-testid="busy" />
      </main>,
    );
    expect(isBusy(el(container, 'busy'))).toBe(true);
    expect(resolveTarget({ id: 'page.add' }).status).toBe('pending');
  });

  it('SUP-08 data-tour-busy also means pending', () => {
    render(
      <main>
        <section data-tour-busy />
      </main>,
    );
    expect(resolveTarget({ id: 'page.add' }).status).toBe('pending');
  });

  it('SUP-06 reports lost when the element found earlier is gone and nothing replaced it', () => {
    const detached = document.createElement('button');
    render(<main />);
    expect(resolveTarget({ id: 'page.add' }, { previous: detached })).toMatchObject({ element: null, status: 'lost' });
  });

  it('SUP-06 a replacement for a vanished element is found, not lost', () => {
    const { container } = render(
      <main>
        <button data-tour="page.add" data-testid="add">Add</button>
      </main>,
    );
    const add = show(el(container, 'add'));
    const old = document.createElement('button');
    expect(resolveTarget({ id: 'page.add' }, { previous: old })).toMatchObject({ element: add, status: 'found' });
  });
});

describe('SUP-06 target resolver: matching', () => {
  it('SUP-06 matches one token of a space separated data-tour value', () => {
    const { container } = render(
      <main>
        <button data-tour="page.add shared.thing" data-testid="two">x</button>
      </main>,
    );
    const two = show(el(container, 'two'));
    expect(resolveTarget({ id: 'page.add' }).element).toBe(two);
    expect(resolveTarget({ id: 'shared.thing' }).element).toBe(two);
  });

  it('SUP-06 does not match a longer token that starts with the id', () => {
    const { container } = render(
      <main>
        <button data-tour="page.addMore" data-testid="more">x</button>
      </main>,
    );
    show(el(container, 'more'));
    expect(resolveTarget({ id: 'page.add' }).status).toBe('missing');
  });
});

describe('SUP-07 target resolver: repeated targets', () => {
  const rows = () =>
    render(
      <main>
        <div data-tour="page.row" data-testid="r1" hidden><button data-tour="page.rowAction" data-testid="a1">a</button></div>
        <div data-tour="page.row" data-testid="r2"><button data-tour="page.rowAction" data-testid="a2">b</button></div>
        <div data-tour="page.row" data-testid="r3"><button data-tour="page.rowAction" data-testid="a3">c</button></div>
      </main>,
    );

  it('SUP-07 picks the first visible match in document order', () => {
    const { container } = rows();
    ['r1', 'a1', 'r2', 'a2', 'r3', 'a3'].forEach((id) => show(el(container, id)));
    expect(resolveTarget({ id: 'page.row', repeat: true }).element).toBe(el(container, 'r2'));
  });

  it('SUP-07 counts the visible matches so a duplicate can be reported', () => {
    const { container } = rows();
    ['r2', 'r3'].forEach((id) => show(el(container, id)));
    expect(resolveTarget({ id: 'page.row' }).count).toBe(2);
  });

  it('SUP-07 pick nth takes the nth visible match', () => {
    const { container } = rows();
    ['r2', 'r3'].forEach((id) => show(el(container, id)));
    expect(resolveTarget({ id: 'page.row', repeat: true, pick: 'nth', nth: 1 }).element).toBe(el(container, 'r3'));
    expect(resolveTarget({ id: 'page.row', repeat: true, pick: 'nth', nth: 5 }).status).toBe('missing');
  });

  it('SUP-07 within finds the control inside the first visible parent', () => {
    const { container } = rows();
    ['r2', 'a2', 'r3', 'a3'].forEach((id) => show(el(container, id)));
    expect(resolveTarget({ id: 'page.rowAction', repeat: true, within: 'page.row' }).element).toBe(el(container, 'a2'));
  });

  it('SUP-07 within reports missing when the parent is missing', () => {
    render(<main />);
    expect(resolveTarget({ id: 'page.rowAction', repeat: true, within: 'page.row' }).status).toBe('missing');
  });
});

describe('SUP-10 target resolver: scope', () => {
  const withDialog = () =>
    render(
      <>
        <header data-tour="shell.search" data-testid="shell"><button>s</button></header>
        <main>
          <button data-tour="page.add" data-testid="add">Add</button>
        </main>
        <div role="dialog" aria-modal="true" data-testid="dialog">
          <button data-tour="dlg.save" data-testid="save">Save</button>
        </div>
      </>,
    );

  it('SUP-10 without an open layer the scope is main', () => {
    render(
      <>
        <header />
        <main data-testid="main" />
      </>,
    );
    expect(scopeRoot(document)).toBe(document.querySelector('main'));
  });

  it('SUP-10 an open modal dialog becomes the scope root', () => {
    const { container } = withDialog();
    expect(scopeRoot(document)).toBe(el(container, 'dialog'));
  });

  it('SUP-10 with a dialog open, targets outside it report missing and inside it resolve', () => {
    const { container } = withDialog();
    ['add', 'save', 'shell'].forEach((id) => show(el(container, id)));
    expect(resolveTarget({ id: 'page.add' }).status).toBe('missing');
    expect(resolveTarget({ id: 'dlg.save' }).element).toBe(el(container, 'save'));
  });

  it('SUP-10 a forced page scope ignores the layer, and shell scope sees the whole document', () => {
    const { container } = withDialog();
    ['add', 'save', 'shell'].forEach((id) => show(el(container, id)));
    expect(resolveTarget({ id: 'page.add', scope: 'page' }).element).toBe(el(container, 'add'));
    expect(resolveTarget({ id: 'shell.search', scope: 'shell' }).element).toBe(el(container, 'shell'));
  });

  it('SUP-10 a menu and a data-tour-layer element are layers, and the topmost wins', () => {
    const { container } = render(
      <>
        <main />
        <div role="menu" data-testid="menu" />
        <div data-tour-layer data-testid="layer" />
      </>,
    );
    expect(scopeRoot(document)).toBe(el(container, 'layer'));
  });

  it('SUP-10 a non-modal dialog (the tour card itself) is not a layer', () => {
    render(
      <>
        <main data-testid="main" />
        <div role="dialog" aria-modal="false" />
      </>,
    );
    expect(scopeRoot(document)).toBe(document.querySelector('main'));
  });

  it('SUP-10 with no main element the document is the root', () => {
    expect(scopeRoot(document)).toBe(document);
  });

  it('SUP-06 isVisible is false for a disconnected element', () => {
    expect(isVisible(mockRect(document.createElement('div')))).toBe(false);
  });
});
