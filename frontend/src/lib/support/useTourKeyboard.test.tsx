import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '../../components/ui/Modal/Modal';
import { useTourKeyboard } from './useTourKeyboard';

const created: HTMLElement[] = [];
afterEach(() => {
  created.splice(0).forEach((node) => node.remove());
  vi.restoreAllMocks();
});

/** A stand-in for the tour card: three buttons and an input. */
const popover = () => {
  const root = document.createElement('div');
  root.innerHTML = '<button id="b1">Back</button><button id="b2">Next</button><input id="field" /><button id="b3">Exit</button>';
  document.body.append(root);
  created.push(root);
  return root;
};

const setup = (over: { running?: boolean; waiting?: boolean } = {}) => {
  const root = popover();
  const handlers = { onExit: vi.fn(), onNext: vi.fn(), onBack: vi.fn() };
  const hook = renderHook(
    (props: { running: boolean; waiting: boolean }) => useTourKeyboard({ ...props, ...handlers, popoverRef: { current: root } }),
    { initialProps: { running: over.running ?? true, waiting: over.waiting ?? false } },
  );
  return { root, ...handlers, ...hook, el: (id: string) => root.querySelector(`#${id}`) as HTMLElement };
};

describe('SUP-13 useTourKeyboard: Escape', () => {
  it('SUP-13 Escape exits the tour', () => {
    const { onExit } = setup();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('SUP-13 Escape does not reach listeners further along (a dialog behind the tour)', () => {
    const { onExit } = setup();
    const behind = vi.fn();
    document.addEventListener('keydown', behind);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    document.removeEventListener('keydown', behind);
    expect(onExit).toHaveBeenCalled();
    expect(behind).not.toHaveBeenCalled();
  });

  it('SUP-13 Escape is left to the app while the tour waits for the user to open something', () => {
    const { onExit } = setup({ waiting: true });
    const behind = vi.fn();
    document.addEventListener('keydown', behind);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    document.removeEventListener('keydown', behind);
    expect(onExit).not.toHaveBeenCalled();
    expect(behind).toHaveBeenCalledTimes(1);
  });

  it('SUP-10 with a Modal open behind the tour, Escape closes only the tour', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Behind">
        <p>Content</p>
      </Modal>,
    );
    const { onExit } = setup();
    fireEvent.keyDown(screen.getByText('Content'), { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('SUP-10 once the tour waits for the user, Escape closes the Modal as usual', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Behind">
        <p>Content</p>
      </Modal>,
    );
    const { onExit } = setup({ waiting: true });
    fireEvent.keyDown(screen.getByText('Content'), { key: 'Escape' });
    expect(onExit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SUP-13 useTourKeyboard: arrow keys', () => {
  it('SUP-13 ArrowRight and ArrowLeft move through the tour when focus is in the card', () => {
    const { el, onNext, onBack } = setup();
    fireEvent.keyDown(el('b2'), { key: 'ArrowRight' });
    fireEvent.keyDown(el('b2'), { key: 'ArrowLeft' });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('SUP-13 arrows do nothing when focus is outside the card', () => {
    const { onNext, onBack } = setup();
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(onNext).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it.each([
    ['an input', () => document.createElement('input')],
    ['a textarea', () => document.createElement('textarea')],
    ['a select', () => document.createElement('select')],
    [
      'a contenteditable',
      () => {
        const div = document.createElement('div');
        div.setAttribute('contenteditable', 'true');
        return div;
      },
    ],
  ])('SUP-13 arrows are left alone while typing in %s inside the card', (_name, make) => {
    const { root, onNext, onBack } = setup();
    const field = make();
    root.append(field);
    fireEvent.keyDown(field, { key: 'ArrowRight' });
    fireEvent.keyDown(field, { key: 'ArrowLeft' });
    expect(onNext).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe('SUP-13 useTourKeyboard: Tab', () => {
  it('SUP-13 Tab from the last control wraps to the first', () => {
    const { el } = setup();
    el('b3').focus();
    const event = fireEvent.keyDown(el('b3'), { key: 'Tab' });
    expect(event).toBe(false);
    expect(document.activeElement).toBe(el('b1'));
  });

  it('SUP-13 Shift+Tab from the first control wraps to the last', () => {
    const { el } = setup();
    el('b1').focus();
    fireEvent.keyDown(el('b1'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(el('b3'));
  });

  it('SUP-13 Tab in the middle of the card is left to the browser', () => {
    const { el } = setup();
    const event = fireEvent.keyDown(el('b2'), { key: 'Tab' });
    expect(event).toBe(true);
  });

  it('SUP-13 Tab from the page while the tour explains brings focus into the card', () => {
    const { el } = setup();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(document.activeElement).toBe(el('b1'));
  });

  it('SUP-13 while the tour waits for the user the page is not trapped', () => {
    const { el } = setup({ waiting: true });
    el('b3').focus();
    const event = fireEvent.keyDown(el('b3'), { key: 'Tab' });
    expect(event).toBe(true);
    expect(document.activeElement).toBe(el('b3'));
  });
});

describe('SUP-13 useTourKeyboard: listener lifetime', () => {
  it('SUP-13 registers no global shortcut while no tour runs', () => {
    const add = vi.spyOn(document, 'addEventListener');
    setup({ running: false });
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);
  });

  it('SUP-13 registers one capture listener while running and removes it when the tour ends', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { rerender } = setup({ running: true });
    const added = add.mock.calls.filter(([type]) => type === 'keydown');
    expect(added).toHaveLength(1);
    expect(added[0][2]).toBe(true);
    rerender({ running: false, waiting: false });
    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
  });

  it('SUP-13 uses the latest handlers without re-registering', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const root = popover();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onExit }) => {
        const ref = useRef(root);
        return useTourKeyboard({ running: true, waiting: false, onExit, onNext: vi.fn(), onBack: vi.fn(), popoverRef: ref });
      },
      { initialProps: { onExit: first } },
    );
    rerender({ onExit: second });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
