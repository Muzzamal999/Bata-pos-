import { useQuery } from '@tanstack/react-query';
import { identityApi } from './api';
import { useAuthStore } from './auth-store';

export function useCurrentUser() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const cachedUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const hasSession = Boolean(accessToken || refreshToken);

  const query = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const user = await identityApi.me();
      setUser(user);
      return user;
    },
    enabled: hasSession,
    initialData: cachedUser ?? undefined,
    staleTime: 60_000,
  });

  return { ...query, hasSession };
}
