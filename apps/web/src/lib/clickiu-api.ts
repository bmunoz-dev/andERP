import type {
  ClickiuFilters,
  ClickiuMovement,
  ClickiuSummary,
  SaveClickiuMovement,
  UpdateClickiuMovement,
} from '@anderp/shared';
import { apiFetch } from './api-client';

export const createClickiuMovement = (body: SaveClickiuMovement) =>
  apiFetch<ClickiuMovement>('/clickiu/movements', { method: 'POST', json: body });

export const updateClickiuMovement = (id: string, body: UpdateClickiuMovement) =>
  apiFetch<ClickiuMovement>(`/clickiu/movements/${id}`, { method: 'PATCH', json: body });

export const clickiuKeys = {
  all: ['clickiu'] as const,
  movements: (f: ClickiuFilters) => ['clickiu', 'movements', f] as const,
  summary: (f: ClickiuFilters) => ['clickiu', 'summary', f] as const,
};

const query = (f: ClickiuFilters) =>
  new URLSearchParams(Object.entries(f).filter((e): e is [string, string] => !!e[1])).toString();

export const listClickiuMovements = (f: ClickiuFilters) =>
  apiFetch<ClickiuMovement[]>(`/clickiu/movements?${query(f)}`);

export const getClickiuSummary = (f: ClickiuFilters) =>
  apiFetch<ClickiuSummary>(`/clickiu/summary?${query(f)}`);

export const deleteClickiuMovement = (id: string) =>
  apiFetch<undefined>(`/clickiu/movements/${id}`, { method: 'DELETE' });
