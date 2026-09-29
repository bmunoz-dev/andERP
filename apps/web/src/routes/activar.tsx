import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthCard } from '@/components/auth-card';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { resetPassword } from '@/lib/auth-api';
import { errorMessage } from '@/lib/error-messages.es';
import {
  type NewPasswordWithConfirmation,
  newPasswordWithConfirmation,
} from '@/lib/password-forms';

/** Activación de cuenta desde la invitación (F02 CA-12). Usa el mismo endpoint que restablecer. */
export const Route = createFileRoute('/activar')({
  validateSearch: z.object({ token: z.string().optional() }),
  component: ActivateAccountPage,
});

function ActivateAccountPage() {
  const { token } = Route.useSearch();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<NewPasswordWithConfirmation>({
    resolver: zodResolver(newPasswordWithConfirmation),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ newPassword }) => {
    if (!token) return;
    setError(null);
    try {
      await resetPassword({ token, newPassword });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  if (!token) {
    return (
      <AuthCard title="Enlace no válido">
        <p className="text-sm text-muted-foreground">
          Al enlace le falta información. Ábrelo de nuevo desde el correo de invitación o pide al
          administrador que te la reenvíe.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Activa tu cuenta"
      description="Elige tu contraseña para entrar a AndERP. Usa al menos 12 caracteres."
    >
      {done ? (
        <div className="grid gap-4">
          <Alert>
            <AlertDescription>Tu cuenta está lista.</AlertDescription>
          </Alert>
          <Button asChild>
            <Link to="/login">Iniciar sesión</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FormField
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            autoFocus
            error={errors.newPassword?.message}
            {...form.register('newPassword')}
          />
          <FormField
            label="Confirmar contraseña"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...form.register('confirmPassword')}
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Activando…' : 'Activar cuenta'}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
