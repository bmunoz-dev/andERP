import { z } from 'zod';

/** Política de contraseñas (F01 CA-13). La lista de contraseñas comunes solo vive en la API. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z.email().max(254);

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `Debe tener como máximo ${PASSWORD_MAX_LENGTH} caracteres`);

export const loginRequestSchema = z.object({
  email: emailSchema,
  // En el login no se valida la política: una contraseña antigua más corta debe poder entrar.
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
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

export const authProfileSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  isSuperAdmin: z.boolean(),
  organization: z.object({ id: z.uuid(), name: z.string() }),
  role: memberRoleSchema,
});
export type AuthProfile = z.infer<typeof authProfileSchema>;

/** Respuesta de login y refresh. El refresh token nunca viaja en el cuerpo, solo en la cookie. */
export const authSessionResponseSchema = z.object({
  accessToken: z.string(),
  user: authProfileSchema,
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;
