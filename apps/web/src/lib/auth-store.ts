import type { AuthProfile, AuthSessionResponse } from '@anderp/shared';
import { useSyncExternalStore } from 'react';

/**
 * Sesión de la web. El access token vive SOLO en memoria (nunca en localStorage); al recargar
 * la página se recupera con el refresh token de la cookie HttpOnly (F01 CA-20).
 */
export type AuthState =
  | { status: 'unknown'; accessToken: null; user: null }
  | { status: 'anonymous'; accessToken: null; user: null }
  | { status: 'authenticated'; accessToken: string; user: AuthProfile };

const listeners = new Set<() => void>();
let state: AuthState = { status: 'unknown', accessToken: null, user: null };

function emit(next: AuthState): void {
  state = next;
  for (const listener of listeners) listener();
}

export const authStore = {
  get: (): AuthState => state,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setSession: (session: AuthSessionResponse): void => {
    emit({ status: 'authenticated', accessToken: session.accessToken, user: session.user });
  },
  clear: (): void => {
    emit({ status: 'anonymous', accessToken: null, user: null });
  },
};

export function useAuth(): AuthState {
  return useSyncExternalStore(authStore.subscribe, authStore.get);
}
