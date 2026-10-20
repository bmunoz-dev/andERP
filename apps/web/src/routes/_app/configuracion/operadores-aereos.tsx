import { type AirOperator, saveAirOperatorSchema } from '@anderp/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  airKeys,
  createAirOperator,
  listAirOperators,
  updateAirOperator,
} from '@/lib/air-accounts-api';
import { errorMessage } from '@/lib/error-messages.es';

export const Route = createFileRoute('/_app/configuracion/operadores-aereos')({
  component: AirOperatorsPage,
});

/** Catálogo de operadores aéreos (F18 CA-27): crear, renombrar y activar o desactivar. */
function AirOperatorsPage() {
  const queryClient = useQueryClient();
  const operators = useQuery({ queryKey: airKeys.operators, queryFn: listAirOperators });
  const [editing, setEditing] = useState<AirOperator | 'new' | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: airKeys.all });

  const toggle = useMutation({
    mutationFn: (o: AirOperator) => updateAirOperator(o.id, { isActive: !o.isActive }),
    onSuccess: (o) => {
      toast.success(o.isActive ? `"${o.name}" está activo` : `"${o.name}" quedó inactivo`);
      return refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const columns: ColumnDef<AirOperator>[] = [
    {
      accessorKey: 'name',
      header: 'Nombre',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: 'status',
      header: 'Estado',
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="secondary">Activo</Badge>
        ) : (
          <Badge variant="outline">Inactivo</Badge>
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
            aria-label={`Editar ${row.original.name}`}
            onClick={() => {
              setEditing(row.original);
            }}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={toggle.isPending}
            onClick={() => {
              toggle.mutate(row.original);
            }}
          >
            {row.original.isActive ? 'Desactivar' : 'Activar'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Operadores aéreos"
        description="Aerolíneas y consolidadores con los que tienes cuentas para emitir tiquetes."
        actions={
          <Button
            onClick={() => {
              setEditing('new');
            }}
          >
            <Plus />
            Nuevo operador
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={operators.data}
        isLoading={operators.isPending}
        emptyMessage="Aún no hay operadores aéreos."
        getRowId={(o) => o.id}
      />
      {editing && (
        <OperatorDialog
          operator={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={refresh}
        />
      )}
    </>
  );
}

function OperatorDialog({
  operator,
  onClose,
  onSaved,
}: {
  operator: AirOperator | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ name: string }>({
    resolver: zodResolver(saveAirOperatorSchema),
    defaultValues: { name: operator?.name ?? '' },
  });

  const save = useMutation({
    mutationFn: ({ name }: { name: string }) =>
      operator ? updateAirOperator(operator.id, { name }) : createAirOperator({ name }),
    onSuccess: async () => {
      toast.success(operator ? 'Operador actualizado' : 'Operador creado');
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
      title={operator ? 'Editar operador' : 'Nuevo operador'}
      error={error}
      submitLabel="Guardar"
      isSubmitting={save.isPending}
      onSubmit={() =>
        void form.handleSubmit((values) => {
          save.mutate(values);
        })()
      }
    >
      <FormField
        label="Nombre"
        autoFocus
        error={form.formState.errors.name?.message}
        {...form.register('name')}
      />
    </FormDialog>
  );
}
