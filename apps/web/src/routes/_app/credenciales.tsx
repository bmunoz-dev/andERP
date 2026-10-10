import { type Credential, saveCredentialSchema, updateCredentialSchema } from '@anderp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useId, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CopyButton, RevealButton } from '@/components/credentials/password-buttons';
import { DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { SelectField } from '@/components/select-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  createCredential,
  credentialKeys,
  deleteCredential,
  listCredentials,
  listResponsibles,
  updateCredential,
} from '@/lib/credentials-api';
import { errorMessage } from '@/lib/error-messages.es';

export const Route = createFileRoute('/_app/credenciales')({
  component: CredentialsPage,
});

/** Credenciales de portales externos (F06 CA-14). */
function CredentialsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  // undefined: formulario cerrado; null: credencial nueva.
  const [editing, setEditing] = useState<Credential | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Credential | null>(null);
  const credentials = useQuery({
    queryKey: credentialKeys.list(deferred),
    queryFn: () => listCredentials(deferred),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: credentialKeys.all });

  const remove = useMutation({
    mutationFn: (c: Credential) => deleteCredential(c.id),
    onSuccess: async () => {
      toast.success('Credencial eliminada');
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns: ColumnDef<Credential>[] = [
    {
      id: 'entity',
      header: 'Entidad',
      cell: ({ row }) => <span className="font-medium">{row.original.entityName}</span>,
    },
    { id: 'username', header: 'Usuario', cell: ({ row }) => row.original.username },
    {
      id: 'url',
      header: 'Enlace',
      cell: ({ row }) =>
        row.original.url ? (
          <a
            href={row.original.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
          >
            Abrir
            <ExternalLink className="size-3" />
          </a>
        ) : (
          '—'
        ),
    },
    {
      id: 'responsible',
      header: 'Responsable',
      cell: ({ row }) => row.original.responsiblePerson?.name ?? '—',
    },
    {
      id: 'password',
      header: 'Contraseña',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <RevealButton credentialId={row.original.id} />
          <CopyButton credentialId={row.original.id} />
        </div>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Editar credencial"
            onClick={() => {
              setEditing(row.original);
            }}
          >
            <Pencil />
          </Button>
          <Button
            variant="destructive-ghost"
            size="icon"
            aria-label="Eliminar credencial"
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
        title="Credenciales"
        description="Accesos a portales externos. Cada vez que se revela una contraseña queda registrado."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
            }}
          >
            <Plus />
            Nueva credencial
          </Button>
        }
      />
      <div className="relative mb-4">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Buscar por entidad, usuario o responsable"
          placeholder="Buscar por entidad, usuario o responsable"
          className="pl-9"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
        />
      </div>
      <DataTable
        columns={columns}
        data={credentials.data}
        isLoading={credentials.isPending}
        emptyMessage={
          search ? 'Ninguna credencial coincide con la búsqueda.' : 'Aún no hay credenciales.'
        }
        getRowId={(c) => c.id}
      />
      {editing !== undefined && (
        <CredentialFormDialog
          credential={editing}
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
        title="¿Eliminar esta credencial?"
        description="La contraseña deja de estar disponible en AndERP."
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

function CredentialFormDialog({
  credential,
  onClose,
  onSaved,
}: {
  credential: Credential | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const notesId = useId();
  const [values, setValues] = useState({
    entityName: credential?.entityName ?? '',
    username: credential?.username ?? '',
    password: '',
    url: credential?.url ?? '',
    contact1: credential?.contact1 ?? '',
    contact2: credential?.contact2 ?? '',
    notes: credential?.notes ?? '',
    responsiblePersonId: credential?.responsiblePerson?.id ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const responsibles = useQuery({
    queryKey: credentialKeys.responsibles,
    queryFn: listResponsibles,
  });

  // La contraseña es de solo escritura: al editar, vacía significa "no cambiar" (CA-7).
  const { password, ...rest } = values;
  const body = credential && password === '' ? rest : values;
  const schema = credential ? updateCredentialSchema : saveCredentialSchema;

  const save = useMutation({
    mutationFn: () =>
      credential ? updateCredential(credential.id, body) : createCredential(values),
    onSuccess: async () => {
      toast.success(credential ? 'Credencial actualizada' : 'Credencial creada');
      await onSaved();
      onClose();
    },
    onError: (e) => {
      setError(errorMessage(e));
    },
  });

  const set = (name: keyof typeof values) => (value: string) => {
    setValues({ ...values, [name]: value });
  };
  const field = (name: keyof typeof values, label: string, props: object = {}) => (
    <FormField
      label={label}
      value={values[name]}
      error={errors[name]}
      onChange={(e) => {
        set(name)(e.target.value);
      }}
      {...props}
    />
  );

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={credential ? 'Editar credencial' : 'Nueva credencial'}
      error={error}
      submitLabel="Guardar"
      isSubmitting={save.isPending}
      onSubmit={() => {
        const parsed = schema.safeParse(body);
        setErrors(
          parsed.success
            ? {}
            : Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
        );
        if (parsed.success) save.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field('entityName', 'Entidad', { placeholder: 'DIAN, banco, secretaría…' })}
        {field('username', 'Usuario', { autoComplete: 'off' })}
      </div>
      {field('password', 'Contraseña', {
        type: 'password',
        autoComplete: 'new-password',
        placeholder: credential ? 'Dejar vacío para no cambiar' : '',
      })}
      {field('url', 'Enlace (opcional)', { type: 'url', placeholder: 'https://' })}
      <div className="grid gap-4 sm:grid-cols-2">
        {field('contact1', 'Contacto 1 (opcional)')}
        {field('contact2', 'Contacto 2 (opcional)')}
      </div>
      <SelectField
        label="Responsable"
        placeholder="Sin responsable"
        noneLabel="Sin responsable"
        value={values.responsiblePersonId}
        onChange={set('responsiblePersonId')}
        options={(responsibles.data ?? []).map((p) => ({
          value: p.id,
          label: `${p.firstName} ${p.lastName}`,
        }))}
      />
      <div className="grid gap-2">
        <Label htmlFor={notesId}>Notas (opcional)</Label>
        <Textarea
          id={notesId}
          rows={3}
          value={values.notes}
          onChange={(e) => {
            set('notes')(e.target.value);
          }}
        />
      </div>
    </FormDialog>
  );
}
