import { IdentityApi, ProductInventoryApi, SalesPosApi, ReportingApi, AuthHooks } from '@bata-pos/api-clients';
import { API_URLS } from './env';
import { useAuthStore } from './auth-store';

const authHooks: AuthHooks = {
  getAccessToken: () => useAuthStore.getState().accessToken,

  refreshAccessToken: async () => {
    const refreshToken = useAuthStore.getState().refreshToken;
    if (!refreshToken) {
      return null;
    }
    try {
      const tokens = await identityApi.refresh(refreshToken);
      useAuthStore.getState().setSession(tokens.accessToken, tokens.refreshToken);
      return tokens.accessToken;
    } catch {
      return null;
    }
  },

  onAuthExpired: () => {
    useAuthStore.getState().clear();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
};

// One shared authHooks object, so a 401 on ANY service's client triggers the
// same refresh-via-Identity flow and the same session, rather than each
// client managing its own (and potentially racing) refresh.
export const identityApi = new IdentityApi(API_URLS.identity, authHooks);
export const productInventoryApi = new ProductInventoryApi(API_URLS.productInventory, authHooks);
export const salesPosApi = new SalesPosApi(API_URLS.salesPos, authHooks);
export const reportingApi = new ReportingApi(API_URLS.reporting, authHooks);
