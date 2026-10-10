import { type ResponsiblePerson, saveResponsiblePersonSchema } from '@anderp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  createResponsible,
  credentialKeys,
  deleteResponsible,
  listResponsibles,
  updateResponsible,
} from '@/lib/credentials-api';
import { errorMessage } from '@/lib/error-messages.es';

export const Route = createFileRoute('/_app/responsables')({
  component: ResponsiblesPage,
});

/** Responsables de las credenciales (F06 CA-1, CA-2, CA-14). */
function ResponsiblesPage() {
  const queryClient = useQueryClient();
  // undefined: formulario cerrado; null: responsable nuevo.
  const [editing, setEditing] = useState<ResponsiblePerson | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<ResponsiblePerson | null>(null);
  const persons = useQuery({ queryKey: credentialKeys.responsibles, queryFn: listResponsibles });
  const refresh = () => queryClient.invalidateQueries({ queryKey: credentialKeys.responsibles });

  const remove = useMutation({
    mutationFn: (p: ResponsiblePerson) => deleteResponsible(p.id),
    onSuccess: async () => {
      toast.success('Responsable eliminado');
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns: ColumnDef<ResponsiblePerson>[] = [
    {
      id: 'name',
      header: 'Nombre',
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.firstName} {row.original.lastName}
        </span>
      ),
    },
    { id: 'email', header: 'Correo', cell: ({ row }) => row.original.email ?? '—' },
    { id: 'phone', header: 'Teléfono', cell: ({ row }) => row.original.phone ?? '—' },
    {
      id: 'actions',
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Editar responsable"
            onClick={() => {
              setEditing(row.original);
            }}
          >
            <Pencil />
          </Button>
          <Button
            variant="destructive-ghost"
            size="icon"
            aria-label="Eliminar responsable"
            onClick={() => {
              setDeleting(row.original);
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Responsables"
        description="Personas a cargo de las credenciales de cada entidad."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
            }}
          >
            <Plus />
            Nuevo responsable
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={persons.data}
        isLoading={persons.isPending}
        emptyMessage="Aún no hay responsables."
        getRowId={(p) => p.id}
      />
      {editing !== undefined && (
        <ResponsibleFormDialog
          person={editing}
          onClose={() => {
            setEditing(undefined);
          }}
          onSaved={refresh}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="¿Eliminar este responsable?"
        description="Solo se puede si no tiene credenciales asignadas."
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
          setDeleting(null);
        }}
      />
    </>
  );
}

function ResponsibleFormDialog({
  person,
  onClose,
  onSaved,
}: {
  person: ResponsiblePerson | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState({
    firstName: person?.firstName ?? '',
    lastName: person?.lastName ?? '',
    email: person?.email ?? '',
    phone: person?.phone ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => (person ? updateResponsible(person.id, values) : createResponsible(values)),
    onSuccess: async () => {
      toast.success(person ? 'Responsable actualizado' : 'Responsable creado');
      await onSaved();
      onClose();
    },
    onError: (e) => {
      setError(errorMessage(e));
    },
  });

  const field = (name: keyof typeof values, label: string, type = 'text') => (
    <FormField
      label={label}
      type={type}
      value={values[name]}
      error={errors[name]}
      onChange={(e) => {
        setValues({ ...values, [name]: e.target.value });
      }}
    />
  );

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={person ? 'Editar responsable' : 'Nuevo responsable'}
      description="Indica al menos un correo o un teléfono."
      error={error}
      submitLabel="Guardar"
      isSubmitting={save.isPending}
      onSubmit={() => {
        const parsed = saveResponsiblePersonSchema.safeParse(values);
        setErrors(
          parsed.success
            ? {}
            : Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
        );
        if (parsed.success) save.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field('firstName', 'Nombre')}
        {field('lastName', 'Apellido')}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field('email', 'Correo', 'email')}
        {field('phone', 'Teléfono', 'tel')}
      </div>
    </FormDialog>
  );
}
