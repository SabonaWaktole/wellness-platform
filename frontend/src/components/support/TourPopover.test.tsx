import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadSupportCopy } from '../../lib/support/supportCopy';
import type { StepCopy } from '../../lib/support/types';
import { TourPopover } from './TourPopover';

beforeAll(async () => {
  await loadSupportCopy('support');
});

const COPY: StepCopy = {
  title: 'Add a client',
  body: 'Opens the form for a new client.',
  when: 'When someone new walks in.',
  warning: 'Nothing is saved until you press Save.',
  disabled: 'You need permission to add clients.',
};

const handlers = () => ({
  onNext: vi.fn(),
  onBack: vi.fn(),
  onSkip: vi.fn(),
  onExit: vi.fn(),
  onFinish: vi.fn(),
  onReplay: vi.fn(),
  onClose: vi.fn(),
});

const renderStep = (over: Partial<Parameters<typeof TourPopover>[0]> = {}) => {
  const h = handlers();
  render(<TourPopover variant="step" copy={COPY} index={1} total={4} status="found" targetRect={null} {...h} {...over} />);
  return h;
};

const buttonNames = () => screen.getAllByRole('button').map((b) => b.textContent);

describe('SUP-03 SUP-14 tour popover: a step', () => {
  it('SUP-14 is a non-modal dialog labelled by its title and described by its body', () => {
    renderStep();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'false');
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') as string);
    const body = document.getElementById(dialog.getAttribute('aria-describedby') as string);
    expect(title).toHaveTextContent('Add a client');
    expect(body).toHaveTextContent('Opens the form for a new client.');
  });

  it('SUP-03 shows the title, the body and when to use it', () => {
    renderStep();
    expect(screen.getByRole('heading', { name: 'Add a client' })).toBeInTheDocument();
    expect(screen.getByText('When to use it')).toBeInTheDocument();
    expect(screen.getByText('When someone new walks in.')).toBeInTheDocument();
  });

  it('SUP-03 omits the "when to use it" section when there is no such copy', () => {
    renderStep({ copy: { title: 'T', body: 'B' } });
    expect(screen.queryByText('When to use it')).toBeNull();
  });

  it('SUP-14 the warning is a labelled note with an icon, not colour alone', () => {
    renderStep();
    const note = screen.getByRole('note');
    expect(within(note).getByText('Be careful')).toBeInTheDocument();
    expect(within(note).getByText('Nothing is saved until you press Save.')).toBeInTheDocument();
    expect(note.querySelector('svg')).not.toBeNull();
  });

  it('SUP-03 appends the disabled hint only when the control is disabled', () => {
    renderStep({ status: 'disabled' });
    expect(screen.getByText('You need permission to add clients.')).toBeInTheDocument();
  });

  it('SUP-03 does not show the disabled hint for an enabled control', () => {
    renderStep({ status: 'found' });
    expect(screen.queryByText('You need permission to add clients.')).toBeNull();
  });

  it('SUP-03 falls back to a generic hint when a disabled step has no hint of its own', () => {
    renderStep({ status: 'disabled', copy: { title: 'T', body: 'B' } });
    expect(screen.getByText('This control is not available right now.')).toBeInTheDocument();
  });

  it('SUP-14 progress is text and a progressbar with valuenow and max', () => {
    renderStep({ index: 2, total: 8 });
    expect(screen.getByText('Step 3 of 8')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Tour progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '8');
  });

  it('SUP-03 keyboard order inside the card is Back, Next, Skip tour, Exit', () => {
    renderStep();
    expect(buttonNames()).toEqual(['Back', 'Next', 'Skip tour', 'Exit']);
  });

  it('SUP-03 every button fires its callback', () => {
    const h = renderStep();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(h.onBack).toHaveBeenCalledTimes(1);
    expect(h.onNext).toHaveBeenCalledTimes(1);
    expect(h.onSkip).toHaveBeenCalledTimes(1);
    expect(h.onExit).toHaveBeenCalledTimes(1);
    expect(h.onFinish).not.toHaveBeenCalled();
  });

  it('SUP-03 hides Back on the first step', () => {
    renderStep({ index: 0 });
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(buttonNames()).toEqual(['Next', 'Skip tour', 'Exit']);
  });

  it('SUP-03 the last step offers Finish instead of Next', () => {
    const h = renderStep({ index: 3, total: 4 });
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(h.onFinish).toHaveBeenCalledTimes(1);
    expect(h.onNext).not.toHaveBeenCalled();
  });

  it('SUP-03 the heading can take focus programmatically', () => {
    renderStep();
    expect(screen.getByRole('heading', { name: 'Add a client' })).toHaveAttribute('tabindex', '-1');
  });
});

describe('SUP-11 tour popover: waiting, lost and completed', () => {
  it('SUP-11 waiting says the page is loading and still offers Exit and Skip tour', () => {
    const h = renderStep({ variant: 'waiting' });
    expect(screen.getByRole('heading', { name: 'Loading this part of the page…' })).toBeInTheDocument();
    expect(buttonNames()).toEqual(['Skip tour', 'Exit']);
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(h.onExit).toHaveBeenCalled();
  });

  it('SUP-11 lost says the item changed and offers Back, Next and Exit', () => {
    const h = renderStep({ variant: 'lost' });
    expect(screen.getByRole('heading', { name: 'This item changed or is no longer on the page' })).toBeInTheDocument();
    expect(buttonNames()).toEqual(['Back', 'Next', 'Skip tour', 'Exit']);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(h.onNext).toHaveBeenCalled();
  });

  it('SUP-11 switching variant keeps the same dialog element, so focus is not dropped', () => {
    const h = handlers();
    const { rerender } = render(<TourPopover variant="step" copy={COPY} index={1} total={4} status="found" targetRect={null} {...h} />);
    const dialog = screen.getByRole('dialog');
    rerender(<TourPopover variant="lost" copy={COPY} index={1} total={4} status="lost" targetRect={null} {...h} />);
    expect(screen.getByRole('dialog')).toBe(dialog);
  });

  it('SUP-03 completed says you are done and offers Replay and Close', () => {
    const h = renderStep({ variant: 'completed' });
    expect(screen.getByRole('heading', { name: "You're done" })).toBeInTheDocument();
    expect(buttonNames()).toEqual(['Replay', 'Close']);
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(h.onReplay).toHaveBeenCalledTimes(1);
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SUP-15 tour popover: placement', () => {
  it('SUP-15 is positioned beside a target on a desktop viewport', () => {
    renderStep({ targetRect: { top: 100, left: 400, width: 100, height: 30 } });
    const dialog = screen.getByRole('dialog');
    expect(dialog.dataset.mode).toBe('floating');
    expect(dialog.style.top).not.toBe('');
  });

  it('SUP-15 docks as a bottom sheet on a phone and reports its height', () => {
    const original = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    const onSheetHeight = vi.fn();
    renderStep({ targetRect: { top: 100, left: 40, width: 100, height: 30 }, onSheetHeight });
    expect(screen.getByRole('dialog').dataset.mode).toBe('sheet');
    expect(onSheetHeight).toHaveBeenCalled();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: original });
  });
});

describe('SUP-10 tour popover: waiting for the user', () => {
  it('SUP-10 asking the user to open something shows the step, says the tour will not click, and offers to skip the part', () => {
    const onSkipPart = vi.fn();
    renderStep({ variant: 'waiting', waitingFor: 'open', onSkipPart });
    expect(screen.getByRole('heading', { name: 'Add a client' })).toBeInTheDocument();
    expect(screen.getByText(/never clicks for you/)).toBeInTheDocument();
    expect(buttonNames()).toEqual(['Skip this part', 'Skip tour', 'Exit']);
    fireEvent.click(screen.getByRole('button', { name: 'Skip this part' }));
    expect(onSkipPart).toHaveBeenCalledTimes(1);
  });

  it('SUP-10 offers to show a part again when the user closed it early', () => {
    renderStep({ variant: 'waiting', waitingFor: 'open', onSkipPart: vi.fn(), note: 'again' });
    expect(screen.getByText('Want to see it again?')).toBeInTheDocument();
  });

  it('SUP-10 asking the user to close something says so, and offers no skip', () => {
    renderStep({ variant: 'waiting', waitingFor: 'close' });
    expect(screen.getByRole('heading', { name: 'Close it to continue' })).toBeInTheDocument();
    expect(buttonNames()).toEqual(['Skip tour', 'Exit']);
  });

  it('SUP-10 the last step of a layer says Continue, not Finish', () => {
    const h = renderStep({ index: 1, total: 2, lastLabel: 'continue' });
    expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(h.onFinish).toHaveBeenCalledTimes(1);
  });

  it('SUP-10 waiting for the page to load is unchanged', () => {
    renderStep({ variant: 'waiting', waitingFor: 'loading' });
    expect(screen.getByRole('heading', { name: 'Loading this part of the page…' })).toBeInTheDocument();
  });
});
