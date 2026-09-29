import { z } from 'zod';
import { emailSchema, memberRoleSchema } from './auth';

const personName = z
  .string()
  .trim()
  .min(1, 'Este campo es obligatorio')
  .max(30, 'Debe tener como máximo 30 caracteres');

export const organizationStatusSchema = z.enum(['active', 'suspended']);
export type OrganizationStatus = z.infer<typeof organizationStatusSchema>;

export const organizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  taxId: z.string(),
  status: organizationStatusSchema,
  memberCount: z.number().int(),
  createdAt: z.string(),
});
export type Organization = z.infer<typeof organizationSchema>;

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, 'Ingresa el nombre').max(100),
  taxId: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z-]{3,20}$/, 'Usa de 3 a 20 números, letras o guiones (p. ej. 900123456-7)'),
  admin: z.object({ email: emailSchema, firstName: personName, lastName: personName }),
});
export type CreateOrganization = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    status: organizationStatusSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.status !== undefined, 'Nada que actualizar');
export type UpdateOrganization = z.infer<typeof updateOrganizationSchema>;

export const memberSchema = z.object({
  userId: z.uuid(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: memberRoleSchema,
  isActive: z.boolean(),
  isSuperAdmin: z.boolean(),
  /** Aún no definió su contraseña desde la invitación. */
  invitationPending: z.boolean(),
  lastLoginAt: z.string().nullable(),
});
export type Member = z.infer<typeof memberSchema>;

export const inviteMemberSchema = z.object({
  email: emailSchema,
  firstName: personName,
  lastName: personName,
});
export type InviteMember = z.infer<typeof inviteMemberSchema>;

export const updateMemberSchema = z.object({ isActive: z.boolean() });
export type UpdateMember = z.infer<typeof updateMemberSchema>;
