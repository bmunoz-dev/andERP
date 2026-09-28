import { type LoginRequest, loginRequestSchema } from '@anderp/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthCard } from '@/components/auth-card';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { login } from '@/lib/auth-api';
import { authStore } from '@/lib/auth-store';
import { errorMessage } from '@/lib/error-messages.es';
import { safeRedirect } from '@/lib/safe-redirect';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: () => {
    if (authStore.get().status === 'authenticated') throw redirect({ to: '/' });
  },
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values);
      router.history.push(safeRedirect(search.redirect));
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthCard title="Iniciar sesión" description="Ingresa con tu correo y contraseña.">
      <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <FormField
          label="Correo"
          type="email"
          autoComplete="username"
          autoFocus
          error={errors.email?.message}
          {...form.register('email')}
        />
        <FormField
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...form.register('password')}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Ingresando…' : 'Ingresar'}
        </Button>
        <Link
          to="/olvide-contrasena"
          className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </AuthCard>
  );
}
