import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

export interface AuthHooks {
  getAccessToken(): string | null;
  /** Resolves with the new access token, or null if refresh failed (e.g. refresh token expired too). */
  refreshAccessToken(): Promise<string | null>;
  /** Called once refresh has failed - caller should clear the session and redirect to login. */
  onAuthExpired(): void;
}

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

/**
 * One Axios instance per backend service. Attaches the current access token
 * to every request, and on a 401 attempts exactly one token refresh - shared
 * across concurrent failing requests via `refreshPromise`, so N simultaneous
 * 401s trigger one refresh call, not N.
 */
export function createHttpClient(baseURL: string, authHooks: AuthHooks): AxiosInstance {
  const client = axios.create({ baseURL });
  let refreshPromise: Promise<string | null> | null = null;

  client.interceptors.request.use((config) => {
    const token = authHooks.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config as RetryableRequestConfig | undefined;
      if (error.response?.status !== 401 || !originalRequest || originalRequest._retried) {
        return Promise.reject(error);
      }
      originalRequest._retried = true;

      if (!refreshPromise) {
        refreshPromise = authHooks.refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;

      if (!newToken) {
        authHooks.onAuthExpired();
        return Promise.reject(error);
      }
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return client(originalRequest);
    },
  );

  return client;
}
