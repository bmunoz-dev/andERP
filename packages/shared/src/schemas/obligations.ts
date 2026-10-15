import { z } from 'zod';
import { isoDateSchema } from './common';
import { optionalText } from './responsible-persons';

export const obligationFrequencySchema = z.enum([
  'once',
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'annual',
]);
export type ObligationFrequency = z.infer<typeof obligationFrequencySchema>;

/** Meses que suma cada periodicidad para sugerir el siguiente vencimiento (F13 CA-20). */
export const FREQUENCY_MONTHS: Partial<Record<ObligationFrequency, number>> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

export const obligationStatusSchema = z.enum(['overdue', 'upcoming', 'scheduled', 'none']);
export type ObligationStatus = z.infer<typeof obligationStatusSchema>;

/** Obligación con una entidad (F13 CA-1). */
export const saveObligationSchema = z.object({
  entityName: z.string().trim().min(1, 'Indica la entidad').max(100),
  concept: z.string().trim().min(1, 'Indica el concepto').max(150),
  frequency: obligationFrequencySchema,
  noticeDays: z.number().int().min(0).max(365).default(15),
  notes: optionalText(5000),
});

/** Al crear se indica el primer vencimiento (CA-3). */
export const createObligationSchema = saveObligationSchema.extend({ firstDueDate: isoDateSchema });
export type CreateObligation = z.input<typeof createObligationSchema>;

export const updateObligationSchema = saveObligationSchema.partial();
export type UpdateObligation = z.input<typeof updateObligationSchema>;

/** Completar identifica el vencimiento que el usuario está viendo (CA-6, CA-7). */
export const completeDueDateSchema = z.object({
  dueDateId: z.uuid(),
  nextDueDate: isoDateSchema.optional(),
});
export type CompleteDueDate = z.input<typeof completeDueDateSchema>;

export const pendingDueDateSchema = z.object({ dueDate: isoDateSchema });
export type PendingDueDate = z.input<typeof pendingDueDateSchema>;

/** Fila de la agenda: estado y días calculados en SQL con la fecha de Bogotá (CA-10, CA-11). */
export const obligationSchema = z.object({
  id: z.uuid(),
  entityName: z.string(),
  concept: z.string(),
  frequency: obligationFrequencySchema,
  noticeDays: z.number(),
  notes: z.string().nullable(),
  pending: z.object({ id: z.uuid(), dueDate: z.string() }).nullable(),
  status: obligationStatusSchema,
  daysLeft: z.number().nullable(),
});
export type Obligation = z.infer<typeof obligationSchema>;

/** Detalle con historial, del más reciente al más antiguo (CA-12). */
export const obligationDetailSchema = obligationSchema.extend({
  history: z.array(
    z.object({
      id: z.uuid(),
      dueDate: z.string(),
      completedAt: z.string().nullable(),
      completedBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    }),
  ),
});
export type ObligationDetail = z.infer<typeof obligationDetailSchema>;
