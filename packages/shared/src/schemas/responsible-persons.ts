import { z } from 'zod';

/** Texto opcional: '' se guarda como null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Debe tener como máximo ${max} caracteres`)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

const personName = (label: string) =>
  z.string().trim().min(1, `Ingresa el ${label}`).max(30, 'Debe tener como máximo 30 caracteres');

/**
 * Responsable de credenciales (F06 CA-1). Que tenga email o teléfono lo exige la base de datos
 * (`responsible_persons_contact_ck` → `CONTACT_REQUIRED`), también al editar.
 */
export const saveResponsiblePersonSchema = z.object({
  firstName: personName('nombre'),
  lastName: personName('apellido'),
  email: z
    .union([z.literal(''), z.email('Ingresa un correo válido').max(254)])
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
  phone: optionalText(20),
});
export type SaveResponsiblePerson = z.input<typeof saveResponsiblePersonSchema>;

export const updateResponsiblePersonSchema = saveResponsiblePersonSchema.partial();
export type UpdateResponsiblePerson = z.input<typeof updateResponsiblePersonSchema>;

export const responsiblePersonSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});
export type ResponsiblePerson = z.infer<typeof responsiblePersonSchema>;
