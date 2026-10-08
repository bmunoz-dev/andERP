import type {
  Credential,
  ResponsiblePerson,
  RevealedPassword,
  SaveCredential,
  SaveResponsiblePerson,
  UpdateCredential,
} from '@anderp/shared';
import { apiFetch } from './api-client';

export const credentialKeys = {
  all: ['credentials'] as const,
  list: (search: string) => ['credentials', 'list', search] as const,
  responsibles: ['responsible-persons'] as const,
};

// ── Responsables ──────────────────────────────────────────────────────────────────────────

export const listResponsibles = () => apiFetch<ResponsiblePerson[]>('/responsible-persons');

export const createResponsible = (body: SaveResponsiblePerson) =>
  apiFetch<ResponsiblePerson>('/responsible-persons', { method: 'POST', json: body });

export const updateResponsible = (id: string, body: SaveResponsiblePerson) =>
  apiFetch<ResponsiblePerson>(`/responsible-persons/${id}`, { method: 'PATCH', json: body });

export const deleteResponsible = (id: string) =>
  apiFetch<undefined>(`/responsible-persons/${id}`, { method: 'DELETE' });

// ── Credenciales ──────────────────────────────────────────────────────────────────────────

export const listCredentials = (search: string) =>
  apiFetch<Credential[]>(`/credentials?search=${encodeURIComponent(search)}`);

export const createCredential = (body: SaveCredential) =>
  apiFetch<Credential>('/credentials', { method: 'POST', json: body });

export const updateCredential = (id: string, body: UpdateCredential) =>
  apiFetch<Credential>(`/credentials/${id}`, { method: 'PATCH', json: body });

export const deleteCredential = (id: string) =>
  apiFetch<undefined>(`/credentials/${id}`, { method: 'DELETE' });

/** Sin caché de TanStack Query: la contraseña solo vive en el componente que la pidió (CA-14). */
export const revealCredential = (id: string) =>
  apiFetch<RevealedPassword>(`/credentials/${id}/reveal`, { method: 'POST' });
