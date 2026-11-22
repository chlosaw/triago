import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, handleSessionExpired, refreshSession, setAccessToken } from '../../api/client';
import type { Profile } from '@triago/shared';
import { AuthContext, type AuthContextValue, type AuthState } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const loadProfile = useCallback(async () => {
    setState({ status: 'signed-in', profile: await api<Profile>('/auth/me') });
  }, []);

  const signedOut = useCallback(() => {
    setAccessToken(null);
    queryClient.clear();
    setState({ status: 'signed-out' });
  }, [queryClient]);

  // Restore the session from the refresh cookie on first load.
  useEffect(() => {
    handleSessionExpired(signedOut);
    refreshSession()
      .then((ok) => (ok ? loadProfile() : signedOut()))
      .catch(signedOut);
  }, [loadProfile, signedOut]);

  const value = useMemo<AuthContextValue>(() => {
    const signIn = async (path: string, body?: unknown) => {
      const { accessToken } = await api<{ accessToken: string }>(path, { method: 'POST', body });
      setAccessToken(accessToken);
      // Another organisation's data must never show under this one, even for a moment.
      queryClient.clear();
      await loadProfile();
    };
    return {
      state,
      login: (email, password) => signIn('/auth/login', { email, password }),
      register: (input) => signIn('/auth/register', input),
      startDemo: () => signIn('/auth/demo'),
      acceptInvite: (input) => signIn('/auth/invitations/accept', input),
      switchOrg: (orgId) => signIn('/auth/switch-org', { orgId }),
      logout: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => {});
        signedOut();
      }
    };
  }, [state, loadProfile, signedOut, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
