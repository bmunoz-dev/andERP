import type { ClickiuMovement, SaveClickiuMovement, UpdateClickiuMovement } from '@anderp/shared';
import { apiFetch } from './api-client';

export const createClickiuMovement = (body: SaveClickiuMovement) =>
  apiFetch<ClickiuMovement>('/clickiu/movements', { method: 'POST', json: body });

export const updateClickiuMovement = (id: string, body: UpdateClickiuMovement) =>
  apiFetch<ClickiuMovement>(`/clickiu/movements/${id}`, { method: 'PATCH', json: body });
