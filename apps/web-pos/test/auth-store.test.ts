import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../lib/auth-store';

describe('Auth store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      selectedBranchId: null,
      hasHydrated: false,
    });
  });

  it('restores a session from persisted storage (simulates survival across a page refresh)', () => {
    // Simulate what zustand/persist already wrote to localStorage on a previous page load.
    localStorage.setItem(
      'bata-pos-cashier-auth',
      JSON.stringify({
        state: {
          accessToken: 'persisted-at',
          refreshToken: 'persisted-rt',
          user: { id: '1', email: 'a@b.com' },
          selectedBranchId: 'branch-1',
        },
        version: 0,
      }),
    );

    const raw = localStorage.getItem('bata-pos-cashier-auth');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.accessToken).toBe('persisted-at');
    expect(parsed.state.refreshToken).toBe('persisted-rt');
    expect(parsed.state.selectedBranchId).toBe('branch-1');
  });

  it('setSession persists both tokens so a reload can restore them', () => {
    useAuthStore.getState().setSession('new-at', 'new-rt');
    expect(useAuthStore.getState().accessToken).toBe('new-at');
    expect(useAuthStore.getState().refreshToken).toBe('new-rt');

    const raw = localStorage.getItem('bata-pos-cashier-auth');
    const parsed = JSON.parse(raw!);
    expect(parsed.state.accessToken).toBe('new-at');
    expect(parsed.state.refreshToken).toBe('new-rt');
  });

  it('setSelectedBranch persists the chosen branch for this session', () => {
    useAuthStore.getState().setSelectedBranch('branch-42');
    expect(useAuthStore.getState().selectedBranchId).toBe('branch-42');

    const raw = localStorage.getItem('bata-pos-cashier-auth');
    const parsed = JSON.parse(raw!);
    expect(parsed.state.selectedBranchId).toBe('branch-42');
  });

  it('clear() (logout) wipes the session and the selected branch from both memory and storage', () => {
    useAuthStore.getState().setSession('at', 'rt');
    useAuthStore.getState().setSelectedBranch('branch-42');
    useAuthStore.getState().setUser({
      id: '1',
      tenantId: null,
      email: 'a@b.com',
      firstName: 'A',
      lastName: 'B',
      isActive: true,
      roles: [],
      permissions: [],
      branchIds: [],
    });

    useAuthStore.getState().clear();

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().selectedBranchId).toBeNull();

    const parsed = JSON.parse(localStorage.getItem('bata-pos-cashier-auth')!);
    expect(parsed.state.accessToken).toBeNull();
    expect(parsed.state.selectedBranchId).toBeNull();
  });
});
