import { type InviteMember, inviteMemberSchema, type Member } from '@anderp/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { MailPlus, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  inviteMember,
  listMembers,
  queryKeys,
  resendInvite,
  setMemberActive,
} from '@/lib/admin-api';
import { useAuth } from '@/lib/auth-store';
import { errorMessage } from '@/lib/error-messages.es';

export const Route = createFileRoute('/_app/configuracion/usuarios')({
  component: MembersPage,
});

const dateTime = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

function MembersPage() {
  const auth = useAuth();
  const currentUserId = auth.status === 'authenticated' ? auth.user.id : null;
  const queryClient = useQueryClient();
  const members = useQuery({ queryKey: queryKeys.members, queryFn: listMembers });
  const [inviting, setInviting] = useState(false);
  const [deactivating, setDeactivating] = useState<Member | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.members });
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const toggle = useMutation({
    mutationFn: (m: Member) => setMemberActive(m.userId, !m.isActive),
    onSuccess: (m) => {
      toast.success(
        m.isActive ? `${m.firstName} puede volver a entrar` : `${m.firstName} ya no puede entrar`,
      );
      return refresh();
    },
    onError,
  });

  const resend = useMutation({
    mutationFn: (m: Member) => resendInvite(m.userId),
    onSuccess: (_, m) => toast.success(`Invitación reenviada a ${m.email}`),
    onError,
  });

  const columns: ColumnDef<Member>[] = [
    {
      id: 'name',
      header: 'Nombre',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">
            {row.original.firstName} {row.original.lastName}
            {row.original.userId === currentUserId && (
              <span className="ml-2 text-xs text-muted-foreground">(tú)</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: ({ row }) => {
        const m = row.original;
        if (!m.isActive) return <Badge variant="outline">Inactivo</Badge>;
        if (m.invitationPending) return <Badge variant="outline">Invitación pendiente</Badge>;
        return (
          <div className="flex gap-1">
            <Badge variant="secondary">Activo</Badge>
            {m.isSuperAdmin && <Badge>Super admin</Badge>}
          </div>
        );
      },
    },
    {
      id: 'lastLogin',
      header: 'Último acceso',
      cell: ({ row }) =>
        row.original.lastLoginAt ? dateTime.format(new Date(row.original.lastLoginAt)) : '—',
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => {
        const m = row.original;
        const canManage =
          m.userId !== currentUserId &&
          !(m.isSuperAdmin && auth.status === 'authenticated' && !auth.user.isSuperAdmin);
        return (
          <div className="flex justify-end gap-1">
            {m.invitationPending && m.isActive && (
              <Button
                variant="ghost"
                size="sm"
                disabled={resend.isPending}
                onClick={() => {
                  resend.mutate(m);
                }}
              >
                <MailPlus />
                Reenviar invitación
              </Button>
            )}
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                disabled={toggle.isPending}
                onClick={() => {
                  if (m.isActive) setDeactivating(m);
                  else toggle.mutate(m);
                }}
              >
                {m.isActive ? 'Desactivar' : 'Activar'}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Personas con acceso a esta organización. Todas tienen rol de administrador."
        actions={
          <Button
            onClick={() => {
              setInviting(true);
            }}
          >
            <UserPlus />
            Invitar usuario
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={members.data}
        isLoading={members.isPending}
        emptyMessage="Aún no hay usuarios."
        getRowId={(m) => m.userId}
      />
      {inviting && (
        <InviteDialog
          onClose={() => {
            setInviting(false);
          }}
          onSaved={refresh}
        />
      )}
      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivating(null);
        }}
        title={`¿Desactivar a ${deactivating?.firstName ?? ''}?`}
        description="Se cerrarán sus sesiones y no podrá entrar a esta organización hasta que lo actives de nuevo."
        confirmLabel="Desactivar"
        destructive
        onConfirm={() => {
          if (deactivating) toggle.mutate(deactivating);
          setDeactivating(null);
        }}
      />
    </>
  );
}

function InviteDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<InviteMember>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: '', firstName: '', lastName: '' },
  });
  const { errors } = form.formState;

  const save = useMutation({
    mutationFn: inviteMember,
    onSuccess: async (m) => {
      toast.success(
        m.invitationPending
          ? `Enviamos una invitación a ${m.email}`
          : `${m.firstName} ya tenía cuenta: le avisamos por correo`,
      );
      await onSaved();
      onClose();
    },
    onError: (e) => {
      setError(errorMessage(e));
    },
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Invitar usuario"
      description="Le llegará un correo para elegir su contraseña. El enlace vence en 72 horas."
      error={error}
      submitLabel="Enviar invitación"
      isSubmitting={save.isPending}
      onSubmit={() =>
        void form.handleSubmit((values) => {
          save.mutate(values);
        })()
      }
    >
      <FormField
        label="Correo"
        type="email"
        autoFocus
        error={errors.email?.message}
        {...form.register('email')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Nombre"
          error={errors.firstName?.message}
          {...form.register('firstName')}
        />
        <FormField
          label="Apellidos"
          error={errors.lastName?.message}
          {...form.register('lastName')}
        />
      </div>
    </FormDialog>
  );
}
