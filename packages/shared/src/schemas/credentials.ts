import { z } from 'zod';
import { optionalText } from './responsible-persons';

/** Credencial de un portal externo (F06 CA-3, CA-4). La contraseña solo viaja de entrada. */
export const saveCredentialSchema = z.object({
  entityName: z.string().trim().min(1, 'Ingresa la entidad').max(100),
  username: z.string().trim().min(1, 'Ingresa el usuario').max(254),
  password: z.string().min(1, 'Ingresa la contraseña').max(256),
  url: z
    .union([
      z.literal(''),
      z.url({ protocol: /^https?$/, error: 'Ingresa una URL http o https' }).max(2048),
    ])
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
  contact1: optionalText(50),
  contact2: optionalText(50),
  notes: optionalText(5000),
  responsiblePersonId: z
    .union([z.literal(''), z.uuid()])
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v)),
});
export type SaveCredential = z.input<typeof saveCredentialSchema>;

/** Sin `password`, la contraseña guardada no cambia (CA-7). */
export const updateCredentialSchema = saveCredentialSchema.partial();
export type UpdateCredential = z.input<typeof updateCredentialSchema>;

/** Nunca incluye la contraseña ni los campos cifrados (CA-5). */
export const credentialSchema = z.object({
  id: z.uuid(),
  entityName: z.string(),
  username: z.string(),
  url: z.string().nullable(),
  contact1: z.string().nullable(),
  contact2: z.string().nullable(),
  notes: z.string().nullable(),
  hasPassword: z.literal(true),
  responsiblePerson: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});
export type Credential = z.infer<typeof credentialSchema>;

export interface RevealedPassword {
  password: string;
}
