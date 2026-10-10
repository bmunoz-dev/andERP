import { z } from 'zod';
import { isoDateSchema, positiveMoneySchema } from './common';

// ── Prestadores ───────────────────────────────────────────────────────────────────────────

export const documentNumberSchema = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z-]{3,20}$/, 'Usa de 3 a 20 números, letras o guiones');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Debe tener como máximo ${max} caracteres`)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

/**
 * La cuenta bancaria va completa o no va (F03 CA-1). La API responde
 * `INCOMPLETE_BANK_ACCOUNT` si llega a medias; aquí solo se valida cada campo.
 */
export const createServiceProviderSchema = z.object({
  name: z.string().trim().min(1, 'Ingresa el nombre').max(100),
  documentTypeId: z.uuid('Elige el tipo de documento'),
  documentNumber: documentNumberSchema,
  description: optionalText(2000),
  bankId: z.uuid().nullable().optional(),
  accountTypeId: z.uuid().nullable().optional(),
  accountNumber: z
    .string()
    .trim()
    .regex(/^[0-9-]{4,30}$/, 'Usa de 4 a 30 números o guiones')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
});
export type CreateServiceProvider = z.infer<typeof createServiceProviderSchema>;

/** F09: `isActive: false` impide contratos nuevos (lo exige también la base de datos). */
export const updateServiceProviderSchema = createServiceProviderSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateServiceProvider = z.infer<typeof updateServiceProviderSchema>;

// ── Contratos ─────────────────────────────────────────────────────────────────────────────

export const paymentFrequencySchema = z.enum(['weekly', 'biweekly', 'monthly', 'bimonthly']);
export type PaymentFrequency = z.infer<typeof paymentFrequencySchema>;

export const PAYMENT_FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  bimonthly: 'Bimestral',
};

export const contractStatusSchema = z.enum(['upcoming', 'active', 'ended']);
export type ContractStatus = z.infer<typeof contractStatusSchema>;

export const createContractSchema = z.object({
  startDate: isoDateSchema,
  endDate: isoDateSchema.nullable().optional(),
  workAgreement: z.string().trim().min(1, 'Describe el acuerdo de trabajo').max(5000),
  paymentFrequency: paymentFrequencySchema,
  totalAmount: positiveMoneySchema,
});
export type CreateContract = z.infer<typeof createContractSchema>;

export const updateContractSchema = createContractSchema.partial();
export type UpdateContract = z.infer<typeof updateContractSchema>;

export const contractSchema = z.object({
  id: z.uuid(),
  serviceProviderId: z.uuid(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  workAgreement: z.string(),
  paymentFrequency: paymentFrequencySchema,
  totalAmount: z.string(),
  status: contractStatusSchema,
  /** Suma de los pagos de honorarios del contrato (F04 CA-10). */
  paidAmount: z.string(),
  /** totalAmount - paidAmount. Negativo si se pagó de más. */
  balance: z.string(),
});
export type Contract = z.infer<typeof contractSchema>;

export const serviceProviderSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  documentType: z.object({ id: z.uuid(), code: z.string() }),
  documentNumber: z.string(),
  description: z.string().nullable(),
  bank: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  accountType: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  accountNumber: z.string().nullable(),
  isActive: z.boolean(),
  /** Contrato vigente hoy (en Bogotá), si lo hay. */
  activeContract: contractSchema.nullable(),
});
export type ServiceProvider = z.infer<typeof serviceProviderSchema>;
