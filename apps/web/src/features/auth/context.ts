import { createContext, useContext } from 'react';
import type { Profile } from '@triago/shared';

export type AuthState = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; profile: Profile };

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  organisation: string;
}

export interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  startDemo: () => Promise<void>;
  /** Joins an organisation from an invitation link and signs in to it. */
  acceptInvite: (input: { token: string; name?: string; password: string }) => Promise<void>;
  /** Moves to another organisation the user belongs to. */
  switchOrg: (orgId: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** The signed-in profile; only call inside routes rendered for signed-in users. */
export function useProfile(): Profile {
  const { state } = useAuth();
  if (state.status !== 'signed-in') throw new Error('useProfile called while signed out');
  return state.profile;
}
