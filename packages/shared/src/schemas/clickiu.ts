import { z } from 'zod';
import { isoDateSchema, positiveMoneySchema } from './common';
import { optionalText } from './responsible-persons';

export const clickiuMovementTypeSchema = z.enum(['recharge', 'sale']);
export type ClickiuMovementType = z.infer<typeof clickiuMovementTypeSchema>;

export const clickiuSaleStatusSchema = z.enum(['credit', 'completed']);
export type ClickiuSaleStatus = z.infer<typeof clickiuSaleStatusSchema>;

/**
 * Recarga o venta de Clic Kiu (F11 CA-1). Que una venta lleve estado y una recarga no lo
 * valida solo la base de datos (CA-2), para que crear y editar respondan con el mismo `code`.
 */
export const saveClickiuMovementSchema = z.object({
  type: clickiuMovementTypeSchema,
  status: clickiuSaleStatusSchema.nullable().optional(),
  movementDate: isoDateSchema,
  amount: positiveMoneySchema,
  description: optionalText(500),
});
export type SaveClickiuMovement = z.input<typeof saveClickiuMovementSchema>;

/** Incluye `type` a propósito: si cambia, lo rechaza el trigger con su `code` (CA-3). */
export const updateClickiuMovementSchema = saveClickiuMovementSchema.partial();
export type UpdateClickiuMovement = z.input<typeof updateClickiuMovementSchema>;

export const clickiuMovementSchema = z.object({
  id: z.uuid(),
  type: clickiuMovementTypeSchema,
  status: clickiuSaleStatusSchema.nullable(),
  movementDate: z.string(),
  amount: z.string(),
  description: z.string().nullable(),
});
export type ClickiuMovement = z.infer<typeof clickiuMovementSchema>;

/** Filtros del listado y del resumen (CA-10 a CA-12). Sin `from` ni `to`: el mes actual. */
export const clickiuFiltersSchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    type: clickiuMovementTypeSchema.optional(),
    status: clickiuSaleStatusSchema.optional(),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, {
    message: 'La fecha inicial no puede ser posterior a la final',
    path: ['to'],
  });
export type ClickiuFilters = z.infer<typeof clickiuFiltersSchema>;

/** Totales del resumen (CA-12). Todas las cifras salen de SQL. */
export const clickiuSummarySchema = z.object({
  totalRecharged: z.string(),
  totalSold: z.string(),
  creditAmount: z.string(),
  balanceAsOf: z.string(),
  currentBalance: z.string(),
});
export type ClickiuSummary = z.infer<typeof clickiuSummarySchema>;
