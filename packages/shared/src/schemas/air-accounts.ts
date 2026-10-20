import { z } from 'zod';
import { moneySchema } from '../money';
import { isoDateSchema, nonNegativeMoneySchema, positiveMoneySchema } from './common';
import { optionalText } from './responsible-persons';

export const airMovementTypeSchema = z.enum([
  'opening_balance',
  'recharge',
  'payment',
  'refund',
  'issue',
]);
export type AirMovementType = z.infer<typeof airMovementTypeSchema>;

export const airCollectionStatusSchema = z.enum(['pending', 'collected']);
export type AirCollectionStatus = z.infer<typeof airCollectionStatusSchema>;

const name = z.string().trim().min(1, 'Obligatorio').max(120, 'Máximo 120 caracteres');

/** `?active=true|false` en los listados de operadores y cuentas (CA-19, CA-20). */
export const airActiveFilterSchema = z.object({ active: z.stringbool().optional() });

// Operadores (CA-1, CA-2)
export const saveAirOperatorSchema = z.object({ name });
export type SaveAirOperator = z.input<typeof saveAirOperatorSchema>;
export const updateAirOperatorSchema = z.object({
  name: name.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAirOperator = z.input<typeof updateAirOperatorSchema>;

export const airOperatorSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isActive: z.boolean(),
});
export type AirOperator = z.infer<typeof airOperatorSchema>;

// Cuentas (CA-3 a CA-5)
export const saveAirAccountSchema = z.object({
  operatorId: z.uuid(),
  name,
  creditLimit: nonNegativeMoneySchema,
});
export type SaveAirAccount = z.input<typeof saveAirAccountSchema>;
export const updateAirAccountSchema = saveAirAccountSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateAirAccount = z.input<typeof updateAirAccountSchema>;

/** Cuenta con su saldo y disponible (vista) y lo por cobrar; todas las cifras salen de SQL. */
export const airAccountSchema = z.object({
  id: z.uuid(),
  operatorId: z.uuid(),
  operatorName: z.string(),
  name: z.string(),
  creditLimit: z.string(),
  isActive: z.boolean(),
  balance: z.string(),
  available: z.string(),
  pendingCollection: z.string(),
});
export type AirAccount = z.infer<typeof airAccountSchema>;

/** Consolidado de las cuentas activas de un operador (CA-20). */
export const airOperatorBalanceSchema = z.object({
  operatorId: z.uuid(),
  operatorName: z.string(),
  balance: z.string(),
  creditLimit: z.string(),
  available: z.string(),
  pendingCollection: z.string(),
});
export type AirOperatorBalance = z.infer<typeof airOperatorBalanceSchema>;

// Movimientos (CA-6 a CA-13)
const common = { movementDate: isoDateSchema, description: optionalText(500) };

const ticketFields = {
  pnr: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, 'El PNR tiene 6 letras o números'),
  ticketNumber: z
    .string()
    .trim()
    .regex(/^\d{13}$/, 'El número de tiquete tiene 13 dígitos'),
  passenger: name,
  netFare: nonNegativeMoneySchema,
  taxes: nonNegativeMoneySchema,
  collectionStatus: airCollectionStatusSchema,
};

const nonZeroMoneySchema = moneySchema.refine((v) => !/^-?0+\.00$/.test(v), 'No puede ser 0');

/**
 * Crear un movimiento: la emisión trae su tiquete y no su monto (lo calcula la API en SQL como
 * `netFare + taxes`, CA-9); los demás tipos traen el monto y no aceptan campos de tiquete (CA-10).
 */
export const createAirMovementSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('issue'),
    ...common,
    ...ticketFields,
    collectionStatus: airCollectionStatusSchema.default('pending'),
  }),
  z.strictObject({ type: z.literal('opening_balance'), ...common, amount: nonZeroMoneySchema }),
  z.strictObject({
    type: z.enum(['recharge', 'payment', 'refund']),
    ...common,
    amount: positiveMoneySchema,
  }),
]);
export type CreateAirMovement = z.input<typeof createAirMovementSchema>;

/**
 * Editar: parcial y sin discriminar. Incluye `type` a propósito; la combinación tipo/campos la
 * valida el CHECK y el cambio de tipo el trigger, así un `PATCH` incoherente responde con su `code`
 * en lugar de ignorarse (CA-10, CA-12).
 */
export const updateAirMovementSchema = z
  .object({ type: airMovementTypeSchema, ...common, amount: moneySchema, ...ticketFields })
  .partial();
export type UpdateAirMovement = z.input<typeof updateAirMovementSchema>;

export const airMovementSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  type: airMovementTypeSchema,
  movementDate: z.string(),
  amount: z.string(),
  description: z.string().nullable(),
  pnr: z.string().nullable(),
  ticketNumber: z.string().nullable(),
  passenger: z.string().nullable(),
  netFare: z.string().nullable(),
  taxes: z.string().nullable(),
  collectionStatus: airCollectionStatusSchema.nullable(),
});
export type AirMovement = z.infer<typeof airMovementSchema>;

/** Filtros del listado y del resumen (CA-21, CA-22). Sin `from` ni `to`: el mes actual. */
export const airMovementFiltersSchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    type: airMovementTypeSchema.optional(),
    collectionStatus: airCollectionStatusSchema.optional(),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, {
    message: 'La fecha inicial no puede ser posterior a la final',
    path: ['to'],
  });
export type AirMovementFilters = z.infer<typeof airMovementFiltersSchema>;

/** Totales del resumen (CA-22). Todas las cifras salen de SQL. */
export const airMovementSummarySchema = z.object({
  totalIn: z.string(),
  totalIssued: z.string(),
  pendingCollection: z.string(),
  balanceAsOf: z.string(),
  currentBalance: z.string(),
  available: z.string(),
});
export type AirMovementSummary = z.infer<typeof airMovementSummarySchema>;
