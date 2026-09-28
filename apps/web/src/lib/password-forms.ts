import { newPasswordSchema } from '@anderp/shared';
import { z } from 'zod';

/** Nueva contraseña con confirmación (la confirmación solo existe en la web). */
export const newPasswordWithConfirmation = z
  .object({
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden',
  });

export type NewPasswordWithConfirmation = z.infer<typeof newPasswordWithConfirmation>;

export const changePasswordForm = z
  .object({
    currentPassword: z.string().min(1, 'Ingresa tu contraseña actual'),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden',
  });

export type ChangePasswordForm = z.infer<typeof changePasswordForm>;
