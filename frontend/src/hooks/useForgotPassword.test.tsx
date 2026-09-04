import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useForgotPassword } from './useForgotPassword';
import { server } from '../setupTests';
import { http, HttpResponse } from 'msw';

describe('useForgotPassword hook', () => {
  it('handles successful password reset request', async () => {
    server.use(
      http.post('http://localhost:3000/api/auth/password-reset/request', () => {
        return HttpResponse.json({ message: 'Reset email sent' });
      })
    );

    const { result } = renderHook(() => useForgotPassword());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isSuccess).toBe(false);

    await act(async () => {
      await result.current.requestReset('test@example.com');
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('handles request failure', async () => {
    server.use(
      http.post('http://localhost:3000/api/auth/password-reset/request', () => {
        return HttpResponse.json({ error: 'Server error' }, { status: 500 });
      })
    );

    const { result } = renderHook(() => useForgotPassword());

    await act(async () => {
      try {
        await result.current.requestReset('test@example.com');
      } catch (e) {
        // Expected error
      }
    });

    expect(result.current.error).toBe('Server error');
    expect(result.current.isSuccess).toBe(false);
  });
});
