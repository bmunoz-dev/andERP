import type {
  Expense,
  ExpenseCategory,
  LedgerEntry,
  MonthlyMatrix,
  SaveExpense,
} from '@anderp/shared';
import { apiFetch } from './api-client';

/** Celda, fila o columna de la matriz: sin `categoryId` ni `week` es el mes completo. */
export interface LedgerFilter {
  categoryId?: string;
  week?: number;
}

export const expenseKeys = {
  all: ['expenses'] as const,
  monthly: (year: number, month: number) => ['expenses', 'monthly', year, month] as const,
  ledger: (year: number, month: number, filter: LedgerFilter) =>
    ['expenses', 'ledger', year, month, filter] as const,
};

export const getMonthlyMatrix = (year: number, month: number) =>
  apiFetch<MonthlyMatrix>(`/reports/expenses/monthly?year=${String(year)}&month=${String(month)}`);

export function getLedger(year: number, month: number, filter: LedgerFilter) {
  const params = new URLSearchParams({ year: String(year), month: String(month) });
  if (filter.categoryId) params.set('categoryId', filter.categoryId);
  if (filter.week) params.set('week', String(filter.week));
  return apiFetch<LedgerEntry[]>(`/reports/expenses/ledger?${params.toString()}`);
}

export const createExpense = (body: SaveExpense) =>
  apiFetch<Expense>('/expenses', { method: 'POST', json: body });

export const updateExpense = (id: string, body: SaveExpense) =>
  apiFetch<Expense>(`/expenses/${id}`, { method: 'PATCH', json: body });

export const deleteExpense = (id: string) =>
  apiFetch<undefined>(`/expenses/${id}`, { method: 'DELETE' });

/** Departamentos elegibles: activos y sin "Honorarios"; al editar se conserva el actual. */
export function categoryOptions(categories: ExpenseCategory[], current: string | null) {
  return categories
    .filter((c) => c.systemCode === null && (c.isActive || c.id === current))
    .map((c) => ({ value: c.id, label: c.name }));
}
