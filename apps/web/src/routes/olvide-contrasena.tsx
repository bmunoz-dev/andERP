import { type ForgotPasswordRequest, forgotPasswordRequestSchema } from '@anderp/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AuthCard } from '@/components/auth-card';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { requestPasswordReset } from '@/lib/auth-api';
import { errorMessage } from '@/lib/error-messages.es';

export const Route = createFileRoute('/olvide-contrasena')({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(forgotPasswordRequestSchema),
    defaultValues: { email: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthCard
      title="¿Olvidaste tu contraseña?"
      description="Te enviaremos un enlace para elegir una nueva."
    >
      {sent ? (
        <div className="grid gap-4">
          <Alert>
            <AlertDescription>
              Si el correo está registrado, te llegará un enlace en unos minutos. Vence en 30
              minutos y solo se puede usar una vez.
            </AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link to="/login">Volver al inicio de sesión</Link>
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
            label="Correo"
            type="email"
            autoComplete="email"
            autoFocus
            error={errors.email?.message}
            {...form.register('email')}
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Enviando…' : 'Enviar enlace'}
          </Button>
          <Link
            to="/login"
            className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Volver al inicio de sesión
          </Link>
        </form>
      )}
    </AuthCard>
  );
}
