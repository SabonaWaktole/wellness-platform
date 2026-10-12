import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadSupportCopy } from '../../lib/support/supportCopy';
import { PickBanner } from './PickBanner';

beforeAll(async () => {
  await loadSupportCopy('support');
});

describe('SUP-14 PickBanner', () => {
  it('SUP-14 tells the user what to do and how to stop', () => {
    render(<PickBanner candidateName="" onCancel={() => {}} />);
    expect(screen.getByText('Pick a control. Press Escape to cancel.')).toBeInTheDocument();
  });

  it('SUP-14 is Support’s own UI, so the read-only guard leaves it alone', () => {
    const { container } = render(<PickBanner candidateName="" onCancel={() => {}} />);
    expect(container.firstElementChild).toHaveAttribute('data-support-ui');
  });

  it('SUP-14 announces the control under the pointer or the keyboard, politely', () => {
    const { rerender } = render(<PickBanner candidateName="" onCancel={() => {}} />);
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toBeEmptyDOMElement();
    rerender(<PickBanner candidateName="Add a client" onCancel={() => {}} />);
    expect(live).toHaveTextContent('Highlighted: Add a client');
  });

  it('SUP-04 has a Cancel button for people who do not use Escape', () => {
    const onCancel = vi.fn();
    render(<PickBanner candidateName="" onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
