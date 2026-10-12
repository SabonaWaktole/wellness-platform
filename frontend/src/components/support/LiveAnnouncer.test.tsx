import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { announce, useAnnouncerStore } from '../../lib/support/announcer';
import { LiveAnnouncer } from './LiveAnnouncer';

describe('SUP-14 LiveAnnouncer', () => {
  beforeEach(() => act(() => useAnnouncerStore.getState().clear()));

  it('SUP-14 is a polite status region', () => {
    render(<LiveAnnouncer />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region).toBeEmptyDOMElement();
  });

  it('SUP-14 shows the announced text', () => {
    render(<LiveAnnouncer />);
    act(() => announce('Step 1 of 3: Add a client'));
    expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 3: Add a client');
  });

  it('SUP-14 follows the next message', () => {
    render(<LiveAnnouncer />);
    act(() => announce('One'));
    act(() => announce('Two'));
    expect(screen.getByRole('status')).toHaveTextContent('Two');
  });
});
