import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePermission, usePermissionScope } from './usePermission';
import { useAuthStore } from '../store/useAuthStore';

describe('usePermission (FR-RBAC-07)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isInitializing: false });
  });

  it('is false when there is no user', () => {
    const { result } = renderHook(() => usePermission('companies.view'));
    expect(result.current).toBe(false);
  });

  it('is false when the permission is not in the map', () => {
    useAuthStore.setState({
      user: { userId: '1', role: 'STAFF', tenantId: 't1', tenantSlug: 't1', email: 'e', permissions: {} },
    });
    const { result } = renderHook(() => usePermission('companies.view'));
    expect(result.current).toBe(false);
  });

  it('is true for a scoped grant', () => {
    useAuthStore.setState({
      user: {
        userId: '1',
        role: 'STAFF',
        tenantId: 't1',
        tenantSlug: 't1',
        email: 'e',
        permissions: { 'companies.view': 'OWN' },
      },
    });
    const { result } = renderHook(() => usePermission('companies.view'));
    expect(result.current).toBe(true);
  });

  it('is true for a plain (unscoped) grant', () => {
    useAuthStore.setState({
      user: {
        userId: '1',
        role: 'BUSINESS_OWNER',
        tenantId: 't1',
        tenantSlug: 't1',
        email: 'e',
        permissions: { 'users.manage': true },
      },
    });
    const { result } = renderHook(() => usePermission('users.manage'));
    expect(result.current).toBe(true);
  });
});

describe('usePermissionScope', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isInitializing: false });
  });

  it('returns the held scope', () => {
    useAuthStore.setState({
      user: {
        userId: '1',
        role: 'STAFF',
        tenantId: 't1',
        tenantSlug: 't1',
        email: 'e',
        permissions: { 'companies.view': 'TEAM' },
      },
    });
    const { result } = renderHook(() => usePermissionScope('companies.view'));
    expect(result.current).toBe('TEAM');
  });

  it('returns null for an unscoped (plain) grant', () => {
    useAuthStore.setState({
      user: {
        userId: '1',
        role: 'BUSINESS_OWNER',
        tenantId: 't1',
        tenantSlug: 't1',
        email: 'e',
        permissions: { 'users.manage': true },
      },
    });
    const { result } = renderHook(() => usePermissionScope('users.manage'));
    expect(result.current).toBeNull();
  });

  it('returns null when the permission is not held', () => {
    useAuthStore.setState({
      user: { userId: '1', role: 'STAFF', tenantId: 't1', tenantSlug: 't1', email: 'e', permissions: {} },
    });
    const { result } = renderHook(() => usePermissionScope('companies.view'));
    expect(result.current).toBeNull();
  });
});
