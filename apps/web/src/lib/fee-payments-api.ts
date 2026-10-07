import type { ContractOption, FeePayment, SaveFeePayment } from '@anderp/shared';
import { apiFetch } from './api-client';

export interface FeePaymentFilters {
  periodYear: number;
  periodMonth: number;
  /** 0 = todas las semanas. */
  weekOfMonth: number;
}

export const feePaymentKeys = {
  all: ['fee-payments'] as const,
  list: (filters: FeePaymentFilters) => ['fee-payments', 'list', filters] as const,
  detail: (id: string) => ['fee-payments', 'detail', id] as const,
  contracts: (start: string, end: string) => ['contracts', 'overlaps', start, end] as const,
};

export function listFeePayments(filters: FeePaymentFilters): Promise<FeePayment[]> {
  const params = new URLSearchParams({
    periodYear: String(filters.periodYear),
    periodMonth: String(filters.periodMonth),
  });
  if (filters.weekOfMonth) params.set('weekOfMonth', String(filters.weekOfMonth));
  return apiFetch(`/fee-payments?${params.toString()}`);
}

export const getFeePayment = (id: string) => apiFetch<FeePayment>(`/fee-payments/${id}`);

export const createFeePayment = (body: SaveFeePayment) =>
  apiFetch<FeePayment>('/fee-payments', { method: 'POST', json: body });

export const updateFeePayment = (id: string, body: SaveFeePayment) =>
  apiFetch<FeePayment>(`/fee-payments/${id}`, { method: 'PUT', json: body });

export const deleteFeePayment = (id: string) =>
  apiFetch<undefined>(`/fee-payments/${id}`, { method: 'DELETE' });

export const listOverlappingContracts = (start: string, end: string) =>
  apiFetch<ContractOption[]>(`/contracts?overlaps=${start}..${end}`);

export const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
