import { z } from 'zod';

/** Política de contraseñas (F01 CA-13). La lista de contraseñas comunes solo vive en la API. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

// Los mensajes están en español porque la web los muestra tal cual en los formularios.
export const emailSchema = z
  .email('Ingresa un correo válido')
  .max(254, 'El correo es demasiado largo');

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `Debe tener como máximo ${PASSWORD_MAX_LENGTH} caracteres`);

export const loginRequestSchema = z.object({
  email: emailSchema,
  // En el login no se valida la política: una contraseña antigua más corta debe poder entrar.
  password: z.string().min(1, 'Ingresa tu contraseña').max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Ingresa tu contraseña actual').max(PASSWORD_MAX_LENGTH),
  newPassword: newPasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1).max(200),
  newPassword: newPasswordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const memberRoleSchema = z.enum(['admin']);
export type MemberRole = z.infer<typeof memberRoleSchema>;

/** Paquetes que se pueden encender por organización (F19). Base no está: siempre está. */
export const APP_MODULES = ['staff_payments', 'credentials', 'air_accounts', 'agenda'] as const;
export const appModuleSchema = z.enum(APP_MODULES);
export type AppModule = z.infer<typeof appModuleSchema>;
/** Lista de paquetes sin repetidos. */
export const appModulesSchema = z
  .array(appModuleSchema)
  .transform((modules) => [...new Set(modules)]);

export const authProfileSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  isSuperAdmin: z.boolean(),
  /** Organización activa de la sesión. */
  organization: z.object({ id: z.uuid(), name: z.string() }),
  /** Organizaciones disponibles para el usuario, por nombre (F20). */
  organizations: z.array(z.object({ id: z.uuid(), name: z.string() })),
  role: memberRoleSchema,
  modules: z.array(appModuleSchema),
});
export type AuthProfile = z.infer<typeof authProfileSchema>;

export const switchOrganizationSchema = z.object({ organizationId: z.uuid() });
export type SwitchOrganization = z.infer<typeof switchOrganizationSchema>;

/** Respuesta de login y refresh. El refresh token nunca viaja en el cuerpo, solo en la cookie. */
export const authSessionResponseSchema = z.object({
  accessToken: z.string(),
  user: authProfileSchema,
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;
