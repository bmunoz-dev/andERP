import type {
  CompleteDueDate,
  CreateObligation,
  Obligation,
  ObligationDetail,
  ObligationFrequency,
  ObligationStatus,
  PendingDueDate,
  UpdateObligation,
} from '@anderp/shared';
import { apiFetch } from './api-client';

export const obligationKeys = {
  all: ['obligations'] as const,
  list: ['obligations', 'list'] as const,
  detail: (id: string) => ['obligations', 'detail', id] as const,
};

// La agenda se pide completa: la tabla, las pestañas y el contador del menú comparten la consulta.
export const listObligations = () => apiFetch<Obligation[]>('/obligations');

export const getObligation = (id: string) => apiFetch<ObligationDetail>(`/obligations/${id}`);

export const createObligation = (body: CreateObligation) =>
  apiFetch<ObligationDetail>('/obligations', { method: 'POST', json: body });

export const updateObligation = (id: string, body: UpdateObligation) =>
  apiFetch<ObligationDetail>(`/obligations/${id}`, { method: 'PATCH', json: body });

export const deleteObligation = (id: string) =>
  apiFetch<undefined>(`/obligations/${id}`, { method: 'DELETE' });

export const completeDueDate = (id: string, body: CompleteDueDate) =>
  apiFetch<ObligationDetail>(`/obligations/${id}/complete`, { method: 'POST', json: body });

export const setPendingDueDate = (id: string, body: PendingDueDate) =>
  apiFetch<ObligationDetail>(`/obligations/${id}/pending`, { method: 'PUT', json: body });

export const removePendingDueDate = (id: string) =>
  apiFetch<undefined>(`/obligations/${id}/pending`, { method: 'DELETE' });

export const STATUS_LABELS: Record<ObligationStatus, string> = {
  overdue: 'Vencido',
  upcoming: 'Próximo',
  scheduled: 'Programado',
  none: 'Sin próximo',
};

export const FREQUENCY_LABELS: Record<ObligationFrequency, string> = {
  once: 'Única',
  monthly: 'Mensual',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
};

/** Contador del menú (F13 CA-16): vencidas y próximas. */
export function countAlerts(list: Obligation[] | undefined): { overdue: number; upcoming: number } {
  const count = (status: ObligationStatus) => list?.filter((o) => o.status === status).length ?? 0;
  return { overdue: count('overdue'), upcoming: count('upcoming') };
}

/** "hoy", "en 5 días" o "hace 3 días" a partir de `daysLeft` (F13 CA-18). */
export function dueText(daysLeft: number): string {
  if (daysLeft === 0) return 'hoy';
  const n = Math.abs(daysLeft);
  const days = `${String(n)} ${n === 1 ? 'día' : 'días'}`;
  return daysLeft > 0 ? `en ${days}` : `hace ${days}`;
}
