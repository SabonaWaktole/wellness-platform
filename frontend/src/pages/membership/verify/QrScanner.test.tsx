import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QrScanner } from './QrScanner';

describe('QrScanner (M4 Slice 13, D13)', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'mediaDevices', original);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('FR-VER-01 a device with no camera API says so and offers the search instead', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    render(<QrScanner onToken={vi.fn()} onStop={vi.fn()} />);
    expect(await screen.findByText(/cannot be used on this device/)).toBeInTheDocument();
  });

  it('FR-VER-01 a blocked camera says how to allow it', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError'));
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    render(<QrScanner onToken={vi.fn()} onStop={vi.fn()} />);
    expect(await screen.findByText(/Camera access was blocked/)).toBeInTheDocument();
  });

  it('stops the camera when the user stops scanning or leaves', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const onStop = vi.fn();
    const { unmount } = render(<QrScanner onToken={vi.fn()} onStop={onStop} />);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Stop scanning' }));
    expect(onStop).toHaveBeenCalled();
    unmount();
    expect(stop).toHaveBeenCalled();
  });
});
