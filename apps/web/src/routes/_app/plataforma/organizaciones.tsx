import {
  APP_MODULES,
  type AppModule,
  type CreateOrganization,
  type CreateOrganizationInput,
  createOrganizationSchema,
  type Organization,
} from '@anderp/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  createOrganization,
  listOrganizations,
  queryKeys,
  updateOrganization,
} from '@/lib/admin-api';
import { errorMessage } from '@/lib/error-messages.es';

export const Route = createFileRoute('/_app/plataforma/organizaciones')({
  component: OrganizationsPage,
});

const date = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' });
const list = new Intl.ListFormat('es', { type: 'conjunction' });

/** Paquetes que el super admin enciende por organización (F19, spec §Paquetes). */
const MODULE_LABELS: Record<AppModule, { name: string; description: string }> = {
  staff_payments: {
    name: 'Personal y pagos',
    description: 'Personal, contratos y su documento, y pagos por días y de monto fijo.',
  },
  credentials: { name: 'Credenciales', description: 'Credenciales y responsables.' },
  air_accounts: { name: 'Cuentas aéreas', description: 'Cuentas aéreas y operadores aéreos.' },
  agenda: { name: 'Agenda', description: 'Agenda y panel de notificaciones.' },
};

function OrganizationsPage() {
  const queryClient = useQueryClient();
  const organizations = useQuery({ queryKey: queryKeys.organizations, queryFn: listOrganizations });
  const [creating, setCreating] = useState(false);
  const [suspending, setSuspending] = useState<Organization | null>(null);
  const [editingModules, setEditingModules] = useState<Organization | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.organizations });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Organization['status'] }) =>
      updateOrganization(id, { status }),
    onSuccess: (o) => {
      toast.success(
        o.status === 'suspended' ? `${o.name} quedó suspendida` : `${o.name} está activa`,
      );
      return refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns: ColumnDef<Organization>[] = [
    {
      accessorKey: 'name',
      header: 'Organización',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    { accessorKey: 'taxId', header: 'NIT' },
    {
      id: 'status',
      header: 'Estado',
      cell: ({ row }) =>
        row.original.status === 'active' ? (
          <Badge variant="secondary">Activa</Badge>
        ) : (
          <Badge variant="destructive">Suspendida</Badge>
        ),
    },
    {
      id: 'modules',
      header: 'Módulos',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.modules.length === 0 ? (
            <Badge variant="outline">Solo Base</Badge>
          ) : (
            APP_MODULES.filter((m) => row.original.modules.includes(m)).map((m) => (
              <Badge key={m} variant="outline">
                {MODULE_LABELS[m].name}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    { accessorKey: 'memberCount', header: 'Usuarios activos' },
    {
      id: 'createdAt',
      header: 'Creada',
      cell: ({ row }) => date.format(new Date(row.original.createdAt)),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => {
        const o = row.original;
        return (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditingModules(o);
              }}
            >
              Módulos
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={setStatus.isPending}
              onClick={() => {
                if (o.status === 'active') setSuspending(o);
                else setStatus.mutate({ id: o.id, status: 'active' });
              }}
            >
              {o.status === 'active' ? 'Suspender' : 'Reactivar'}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Organizaciones"
        description="Empresas que usan AndERP. Cada una ve solo sus propios datos."
        actions={
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            <Plus />
            Nueva organización
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={organizations.data}
        isLoading={organizations.isPending}
        emptyMessage="Aún no hay organizaciones."
        getRowId={(o) => o.id}
      />
      {creating && (
        <CreateOrganizationDialog
          onClose={() => {
            setCreating(false);
          }}
          onSaved={refresh}
        />
      )}
      {editingModules && (
        <ModulesDialog
          organization={editingModules}
          onClose={() => {
            setEditingModules(null);
          }}
          onSaved={refresh}
        />
      )}
      <ConfirmDialog
        open={suspending !== null}
        onOpenChange={(open) => {
          if (!open) setSuspending(null);
        }}
        title={`¿Suspender ${suspending?.name ?? ''}?`}
        description="Sus usuarios perderán el acceso de inmediato. Los datos se conservan y puedes reactivarla cuando quieras."
        confirmLabel="Suspender"
        destructive
        onConfirm={() => {
          if (suspending) setStatus.mutate({ id: suspending.id, status: 'suspended' });
          setSuspending(null);
        }}
      />
    </>
  );
}

function CreateOrganizationDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CreateOrganizationInput, unknown, CreateOrganization>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      name: '',
      taxId: '',
      admin: { email: '', firstName: '', lastName: '' },
      modules: [],
    },
  });
  const { errors } = form.formState;

  const save = useMutation({
    mutationFn: createOrganization,
    onSuccess: async (o) => {
      toast.success(`${o.name} creada. Enviamos la invitación a su administrador.`);
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
      title="Nueva organización"
      description="Se crea con sus departamentos iniciales y se invita a su primer administrador."
      error={error}
      submitLabel="Crear organización"
      isSubmitting={save.isPending}
      onSubmit={() =>
        void form.handleSubmit((values) => {
          save.mutate(values);
        })()
      }
    >
      <FormField label="Nombre" autoFocus error={errors.name?.message} {...form.register('name')} />
      <FormField
        label="NIT"
        placeholder="900123456-7"
        error={errors.taxId?.message}
        {...form.register('taxId')}
      />
      <p className="pt-2 text-sm font-medium">Primer administrador</p>
      <FormField
        label="Correo"
        type="email"
        error={errors.admin?.email?.message}
        {...form.register('admin.email')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Nombre"
          error={errors.admin?.firstName?.message}
          {...form.register('admin.firstName')}
        />
        <FormField
          label="Apellidos"
          error={errors.admin?.lastName?.message}
          {...form.register('admin.lastName')}
        />
      </div>
      <Controller
        control={form.control}
        name="modules"
        render={({ field }) => (
          <ModuleCheckboxes value={field.value ?? []} onChange={field.onChange} />
        )}
      />
    </FormDialog>
  );
}

/** Edita los paquetes; quitar uno encendido pide confirmación (F19 CA-21, CA-23). */
function ModulesDialog({
  organization,
  onClose,
  onSaved,
}: {
  organization: Organization;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [modules, setModules] = useState(organization.modules);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const removed = organization.modules.filter((m) => !modules.includes(m));

  const save = useMutation({
    mutationFn: () => updateOrganization(organization.id, { modules }),
    onSuccess: async (o) => {
      toast.success(`Módulos de ${o.name} actualizados`);
      await onSaved();
      onClose();
    },
    onError: (e) => {
      setError(errorMessage(e));
    },
  });

  return (
    <>
      <FormDialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={`Módulos de ${organization.name}`}
        description="Base (Egresos, Departamentos y Usuarios) siempre está activa."
        error={error}
        submitLabel="Guardar"
        isSubmitting={save.isPending}
        onSubmit={() => {
          if (removed.length > 0) setConfirming(true);
          else save.mutate();
        }}
      >
        <ModuleCheckboxes value={modules} onChange={setModules} />
      </FormDialog>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="¿Quitar módulos?"
        description={`Los usuarios de ${organization.name} dejarán de ver ${list.format(removed.map((m) => MODULE_LABELS[m].name))}. Los datos no se borran.`}
        confirmLabel="Quitar"
        destructive
        onConfirm={() => {
          setConfirming(false);
          save.mutate();
        }}
      />
    </>
  );
}

/** Una casilla nativa por paquete, en el orden de `APP_MODULES`. */
function ModuleCheckboxes({
  value,
  onChange,
}: {
  value: AppModule[];
  onChange: (modules: AppModule[]) => void;
}) {
  return (
    <fieldset className="grid gap-3 pt-2">
      <legend className="pb-2 text-sm font-medium">Módulos</legend>
      {APP_MODULES.map((m) => (
        <label key={m} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={value.includes(m)}
            onChange={(event) => {
              onChange(
                APP_MODULES.filter((x) => (x === m ? event.target.checked : value.includes(x))),
              );
            }}
          />
          <span>
            <span className="font-medium">{MODULE_LABELS[m].name}</span>
            <span className="block text-muted-foreground">{MODULE_LABELS[m].description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
