import type { Meta, StoryObj } from '@storybook/react';
import { AppLayout } from './AppLayout';
import { Sidebar } from '../Sidebar/Sidebar';
import type { NavItem } from '../Sidebar/Sidebar';

const meta = {
  title: 'Layout/AppLayout',
  component: AppLayout,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AppLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockNavItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', isActive: true },
  { id: 'clients', label: 'Clients', icon: 'group' },
  { id: 'appointments', label: 'Appointments', icon: 'event' },
  { id: 'inventory', label: 'Products & Stock', icon: 'inventory_2' },
  { id: 'quotes', label: 'Quotations', icon: 'description' },
  { id: 'reports', label: 'Reports', icon: 'bar_chart' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export const ShellWithSidebar: Story = {
  args: {
    userName: 'Jane Doe',
    userAvatarSrc: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCUVO_U904UXtp4jWW0TlbxmzPuBGIREJnS7rJvUtLWgv77vYvS4vxvhNtsn7uCPM4v19ncCYsTNjqR9gmBTthGZKxWksFTi3WHzwUACJE3fdYz43ve1_UcjRrGN0DsSAnzWy8bcm_ue3gBSicCHOQXi3nTG59avgqC7yDJvl_xzAPCtNRbIGrfduLtU3kRkzKkv4b6G4JpGzlfYerk5A74tOh2EEID2ccvMJyWClcbv_w3W2yL1Gy2hiSvmpCVC63iIga-3SmPV8Nj',
    sidebar: (
      <Sidebar 
        navItems={mockNavItems} 
      />
    ),
    children: (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: '36px', fontWeight: 700, margin: '0 0 16px 0' }}>Welcome to Wellness Albania</h1>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px', color: '#464555', maxWidth: '600px' }}>
          Your workspace is ready. Let's get things set up so you can start managing your clients and growing your business efficiently.
        </p>
      </div>
    ),
  },
};
