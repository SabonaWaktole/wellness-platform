import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { SpotlightMask } from './SpotlightMask';

const Fixture = ({ padding }: { padding?: number }) => {
  const [target, setTarget] = useState<HTMLButtonElement | null>(null);
  return (
    <div style={{ padding: 120 }}>
      <button type="button" ref={setTarget}>
        Highlighted control
      </button>
      <SpotlightMask element={target} padding={padding} />
    </div>
  );
};

const meta = {
  title: 'Support/SpotlightMask',
  component: Fixture,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof Fixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { padding: 4 } };

export const WidePadding: Story = { args: { padding: 16 } };
