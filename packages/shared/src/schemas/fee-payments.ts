import { z } from 'zod';
import { isoDateSchema, nonNegativeMoneySchema, positiveMoneySchema } from './common';
import { paymentModeSchema } from './service-providers';

export const feePaymentDaySchema = z.object({
  workDate: isoDateSchema,
  amount: nonNegativeMoneySchema,
  isHoliday: z.boolean(),
});
export type FeePaymentDay = z.infer<typeof feePaymentDaySchema>;

/**
 * Alta y edición usan el mismo cuerpo (PUT reemplaza los días). Contrato y periodo no se pueden
 * cambiar después de creado: la API responde `FEE_PAYMENT_PERIOD_IMMUTABLE` (F04 CA-11).
 */
export const saveFeePaymentSchema = z.object({
  contractId: z.uuid(),
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
  weekOfMonth: z.number().int().min(1).max(4),
  paymentDate: isoDateSchema,
  notes: z.string().trim().max(1000).nullable().optional(),
  days: z.array(feePaymentDaySchema).max(10),
});
export type SaveFeePayment = z.infer<typeof saveFeePaymentSchema>;

export const feePaymentSchema = z.object({
  id: z.uuid(),
  contractId: z.uuid(),
  serviceProvider: z.object({ id: z.uuid(), name: z.string() }),
  periodYear: z.number(),
  periodMonth: z.number(),
  weekOfMonth: z.number(),
  periodStart: z.string(),
  periodEnd: z.string(),
  paymentDate: z.string(),
  notes: z.string().nullable(),
  total: z.string(),
  days: z.array(feePaymentDaySchema),
});
export type FeePayment = z.infer<typeof feePaymentSchema>;

/** Contrato que se cruza con un rango (para elegir a quién se paga una semana). */
export const contractOptionSchema = z.object({
  id: z.uuid(),
  serviceProvider: z.object({ id: z.uuid(), name: z.string() }),
  startDate: z.string(),
  endDate: z.string().nullable(),
  /** F10 CA-6: monto mensual de referencia y lo ya pagado en el mes del periodo consultado. */
  monthlyAmount: z.string(),
  paidInMonth: z.string(),
  paymentMode: paymentModeSchema,
});
export type ContractOption = z.infer<typeof contractOptionSchema>;

// ── F16: pagos de monto fijo ──────────────────────────────────────────────────────────────

export const saveFixedPaymentSchema = z.object({
  contractId: z.uuid(),
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
  paymentDate: isoDateSchema,
  amount: positiveMoneySchema,
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type SaveFixedPayment = z.infer<typeof saveFixedPaymentSchema>;

/**
 * Contrato y mes trabajado no cambian (F16 CA-9): `.strict()` rechaza esos campos. Un cuerpo
 * vacío no cambia nada y solo dejaría una auditoría sin cambios.
 */
export const updateFixedPaymentSchema = saveFixedPaymentSchema
  .pick({ paymentDate: true, amount: true, notes: true })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Indica al menos un campo para cambiar');
export type UpdateFixedPayment = z.infer<typeof updateFixedPaymentSchema>;

export const fixedPaymentSchema = z.object({
  id: z.uuid(),
  contractId: z.uuid(),
  serviceProvider: z.object({ id: z.uuid(), name: z.string() }),
  periodYear: z.number(),
  periodMonth: z.number(),
  paymentDate: z.string(),
  amount: z.string(),
  notes: z.string().nullable(),
});
export type FixedPayment = z.infer<typeof fixedPaymentSchema>;
