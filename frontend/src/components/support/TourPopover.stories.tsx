import type { Meta, StoryObj } from '@storybook/react';
import { TourPopover } from './TourPopover';

const noop = () => {};

const meta = {
  title: 'Support/TourPopover',
  component: TourPopover,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  args: {
    variant: 'step',
    copy: {
      title: 'Add a client',
      body: 'Opens the form for a new client. Nothing is saved until you press Save.',
      when: 'When someone new walks in.',
    },
    index: 1,
    total: 5,
    status: 'found',
    targetRect: { top: 120, left: 240, width: 140, height: 40 },
    onNext: noop,
    onBack: noop,
    onSkip: noop,
    onExit: noop,
    onFinish: noop,
    onReplay: noop,
    onClose: noop,
  },
} satisfies Meta<typeof TourPopover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Step: Story = {};

export const StepWithWarning: Story = {
  args: { copy: { title: 'Delete a client', body: 'Removes the client from the list.', warning: 'This cannot be undone. The tour never presses it for you.' } },
};

export const DisabledControl: Story = {
  args: { status: 'disabled', copy: { title: 'Add a client', body: 'Opens the form.', disabled: 'You need permission to add clients.' } },
};

export const LastStep: Story = { args: { index: 4 } };

export const Waiting: Story = { args: { variant: 'waiting', targetRect: null } };

export const Lost: Story = { args: { variant: 'lost', status: 'lost', targetRect: null } };

export const Completed: Story = { args: { variant: 'completed', targetRect: null } };

export const BottomSheet: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
