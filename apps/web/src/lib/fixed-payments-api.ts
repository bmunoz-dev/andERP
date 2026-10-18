import type { FixedPayment, SaveFixedPayment, UpdateFixedPayment } from '@anderp/shared';
import { apiFetch } from './api-client';

export interface FixedPaymentFilters {
  periodYear: number;
  periodMonth: number;
}

export const fixedPaymentKeys = {
  all: ['fixed-payments'] as const,
  list: (filters: FixedPaymentFilters) => ['fixed-payments', 'list', filters] as const,
  detail: (id: string) => ['fixed-payments', 'detail', id] as const,
};

export const listFixedPayments = (filters: FixedPaymentFilters) =>
  apiFetch<FixedPayment[]>(
    `/fixed-payments?periodYear=${String(filters.periodYear)}&periodMonth=${String(filters.periodMonth)}`,
  );

export const getFixedPayment = (id: string) => apiFetch<FixedPayment>(`/fixed-payments/${id}`);

export const createFixedPayment = (body: SaveFixedPayment) =>
  apiFetch<FixedPayment>('/fixed-payments', { method: 'POST', json: body });

export const updateFixedPayment = (id: string, body: UpdateFixedPayment) =>
  apiFetch<FixedPayment>(`/fixed-payments/${id}`, { method: 'PATCH', json: body });

export const deleteFixedPayment = (id: string) =>
  apiFetch<undefined>(`/fixed-payments/${id}`, { method: 'DELETE' });
