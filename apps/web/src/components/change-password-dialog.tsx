import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { changePassword } from '@/lib/auth-api';
import { errorMessage } from '@/lib/error-messages.es';
import { type ChangePasswordForm, changePasswordForm } from '@/lib/password-forms';

const emptyForm: ChangePasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const form = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordForm),
    defaultValues: emptyForm,
  });
  const { errors, isSubmitting } = form.formState;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset(emptyForm);
      setError(null);
      setDone(false);
    }
    onOpenChange(next);
  };

  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    setError(null);
    try {
      await changePassword({ currentPassword, newPassword });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>
            Al cambiarla, se cierran tus sesiones en otros equipos. Esta sigue abierta.
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <>
            <Alert>
              <AlertDescription>Tu contraseña se actualizó.</AlertDescription>
            </Alert>
            <DialogFooter>
              <Button
                onClick={() => {
                  handleOpenChange(false);
                }}
              >
                Cerrar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="grid gap-4" noValidate>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <FormField
              label="Contraseña actual"
              type="password"
              autoComplete="current-password"
              error={errors.currentPassword?.message}
              {...form.register('currentPassword')}
            />
            <FormField
              label="Nueva contraseña"
              type="password"
              autoComplete="new-password"
              error={errors.newPassword?.message}
              {...form.register('newPassword')}
            />
            <FormField
              label="Confirmar nueva contraseña"
              type="password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              {...form.register('confirmPassword')}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  handleOpenChange(false);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando…' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
