import { z } from 'zod';
import { isoDateSchema, positiveMoneySchema } from './common';

export const saveExpenseSchema = z.object({
  categoryId: z.uuid('Elige el departamento'),
  concept: z.string().trim().min(1, 'Describe el egreso').max(2000),
  invoiceNumber: z
    .string()
    .trim()
    .max(40, 'Debe tener como máximo 40 caracteres')
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
  paymentDate: isoDateSchema,
  amount: positiveMoneySchema,
});
export type SaveExpense = z.input<typeof saveExpenseSchema>;

export const updateExpenseSchema = saveExpenseSchema.partial();
export type UpdateExpense = z.input<typeof updateExpenseSchema>;

export const expenseSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  concept: z.string(),
  invoiceNumber: z.string().nullable(),
  paymentDate: z.string(),
  /** Calculada por la base de datos a partir de `paymentDate` (formato B). */
  weekOfMonth: z.number(),
  amount: z.string(),
});
export type Expense = z.infer<typeof expenseSchema>;

/** Fila del libro de egresos: un egreso manual o un pago de honorarios (F05 CA-12). */
export const ledgerEntrySchema = z.object({
  source: z.enum(['manual', 'fee_payment']),
  sourceId: z.uuid(),
  categoryId: z.uuid(),
  concept: z.string(),
  invoiceNumber: z.string().nullable(),
  paymentDate: z.string(),
  weekOfMonth: z.number(),
  amount: z.string(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

/** Matriz del mes: departamento × semana (F05 CA-11). Todas las cifras salen de SQL. */
export const monthlyMatrixSchema = z.object({
  year: z.number(),
  month: z.number(),
  weeks: z.array(z.object({ week: z.number(), start: z.string(), end: z.string() })),
  rows: z.array(
    z.object({
      categoryId: z.uuid(),
      name: z.string(),
      isSystem: z.boolean(),
      isActive: z.boolean(),
      cells: z.array(z.string()),
      total: z.string(),
    }),
  ),
  weekTotals: z.array(z.string()),
  grandTotal: z.string(),
});
export type MonthlyMatrix = z.infer<typeof monthlyMatrixSchema>;
