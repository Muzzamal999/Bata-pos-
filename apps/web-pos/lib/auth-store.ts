import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CurrentUser } from '@bata-pos/shared-types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: CurrentUser | null;
  /**
   * The branch the cashier picked for this session, from their own
   * branchIds claim. No register/terminal concept exists anywhere in the
   * backend (no such model in any service's schema), so there is nothing
   * to select or persist there - only branch context is tracked.
   */
  selectedBranchId: string | null;
  /** True once the persisted state has been read back from localStorage - guards must wait for this before deciding to redirect. */
  hasHydrated: boolean;
  setSession: (accessToken: string, refreshToken: string) => void;
  setUser: (user: CurrentUser) => void;
  setSelectedBranch: (branchId: string) => void;
  clear: () => void;
  setHasHydrated: (hydrated: boolean) => void;
}

/**
 * SECURITY TRADEOFF, made deliberately and with the user's sign-off:
 * Identity & Organization issues both tokens as plain JSON in the response
 * body (AuthResponseDto) - it has no Set-Cookie / HttpOnly mechanism at all,
 * and adding one would mean changing that service's auth flow, which is out
 * of scope here. A pure client-rendered SPA with no backend-for-frontend
 * therefore has nowhere to put a persistent session except browser storage.
 * localStorage was chosen over sessionStorage specifically so a session
 * survives a refresh, per this app's own requirement. This is XSS-exposed
 * in a way an HttpOnly cookie would not be; it's an accepted risk for this
 * cashier tool's current architecture, not an oversight. The access token is
 * short-lived (15 min) and the refresh token is rotated server-side on
 * every use, which bounds how long a stolen token stays useful.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      selectedBranchId: null,
      hasHydrated: false,
      setSession: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      setSelectedBranch: (branchId) => set({ selectedBranchId: branchId }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null, selectedBranchId: null }),
      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
    }),
    {
      name: 'bata-pos-cashier-auth',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        selectedBranchId: state.selectedBranchId,
      }),
    },
  ),
);
