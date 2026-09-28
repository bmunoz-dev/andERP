import type {
  AuthSessionResponse,
  ChangePasswordRequest,
  LoginRequest,
  ResetPasswordRequest,
} from '@anderp/shared';
import { apiFetch } from './api-client';
import { authStore } from './auth-store';

export async function login(credentials: LoginRequest): Promise<void> {
  authStore.setSession(
    await apiFetch<AuthSessionResponse>('/auth/login', { method: 'POST', json: credentials }),
  );
}

/** Cierra la sesión en la API; aunque falle la red, la sesión local se borra igual. */
export async function logout(): Promise<void> {
  try {
    await apiFetch<undefined>('/auth/logout', { method: 'POST' });
  } finally {
    authStore.clear();
  }
}

export function changePassword(body: ChangePasswordRequest): Promise<void> {
  return apiFetch('/auth/password/change', { method: 'POST', json: body });
}

export function requestPasswordReset(email: string): Promise<void> {
  return apiFetch('/auth/password/forgot', { method: 'POST', json: { email } });
}

export function resetPassword(body: ResetPasswordRequest): Promise<void> {
  return apiFetch('/auth/password/reset', { method: 'POST', json: body });
}
