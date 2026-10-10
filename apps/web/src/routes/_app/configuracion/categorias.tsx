import { type ExpenseCategory, createExpenseCategorySchema } from '@anderp/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
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
  createExpenseCategory,
  deleteExpenseCategory,
  listExpenseCategories,
  queryKeys,
  reorderExpenseCategories,
  updateExpenseCategory,
} from '@/lib/admin-api';
import { errorMessage } from '@/lib/error-messages.es';
import { moveItem } from '@/lib/reorder';

export const Route = createFileRoute('/_app/configuracion/categorias')({
  component: CategoriesPage,
});

type Editing = { mode: 'create' } | { mode: 'rename'; category: ExpenseCategory } | null;

function CategoriesPage() {
  const queryClient = useQueryClient();
  const categories = useQuery({
    queryKey: queryKeys.expenseCategories,
    queryFn: listExpenseCategories,
  });
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<ExpenseCategory | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.expenseCategories });
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const toggle = useMutation({
    mutationFn: (c: ExpenseCategory) => updateExpenseCategory(c.id, { isActive: !c.isActive }),
    onSuccess: (c) => {
      toast.success(c.isActive ? `"${c.name}" está activo` : `"${c.name}" quedó inactivo`);
      return refresh();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (c: ExpenseCategory) => deleteExpenseCategory(c.id),
    onSuccess: () => {
      toast.success('Departamento eliminado');
      return refresh();
    },
    onError,
  });

  const reorder = useMutation({
    mutationFn: reorderExpenseCategories,
    onSuccess: (updated) => queryClient.setQueryData(queryKeys.expenseCategories, updated),
    onError,
  });

  const move = (index: number, delta: -1 | 1) => {
    if (!categories.data) return;
    reorder.mutate(moveItem(categories.data, index, delta).map((c) => c.id));
  };

  const columns: ColumnDef<ExpenseCategory>[] = [
    {
      id: 'order',
      header: 'Orden',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Subir ${row.original.name}`}
            disabled={row.index === 0 || reorder.isPending}
            onClick={() => {
              move(row.index, -1);
            }}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Bajar ${row.original.name}`}
            disabled={row.index === (categories.data?.length ?? 0) - 1 || reorder.isPending}
            onClick={() => {
              move(row.index, 1);
            }}
          >
            <ArrowDown />
          </Button>
        </div>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Nombre',
      cell: ({ row }) => (
        <span className="flex items-center gap-2 font-medium">
          {row.original.name}
          {row.original.systemCode && (
            <span title="Lo usa el sistema para los pagos de honorarios">
              <Lock
                className="size-3.5 text-muted-foreground"
                aria-label="Departamento del sistema"
              />
            </span>
          )}
        </span>
      ),
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
      cell: ({ row }) => {
        const category = row.original;
        if (category.systemCode) return null;
        return (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Renombrar ${category.name}`}
              onClick={() => {
                setEditing({ mode: 'rename', category });
              }}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={toggle.isPending}
              onClick={() => {
                toggle.mutate(category);
              }}
            >
              {category.isActive ? 'Desactivar' : 'Activar'}
            </Button>
            <Button
              variant="destructive-ghost"
              size="icon"
              aria-label={`Eliminar ${category.name}`}
              onClick={() => {
                setDeleting(category);
              }}
            >
              <Trash2 />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Departamentos"
        description="Categorías en las que se clasifican los egresos. El orden es el de las filas de la matriz mensual."
        actions={
          <Button
            onClick={() => {
              setEditing({ mode: 'create' });
            }}
          >
            <Plus />
            Nuevo departamento
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={categories.data}
        isLoading={categories.isPending}
        emptyMessage="Aún no hay departamentos."
        getRowId={(c) => c.id}
      />
      {editing && (
        <CategoryDialog
          editing={editing}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={refresh}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`¿Eliminar "${deleting?.name ?? ''}"?`}
        description="Deja de aparecer en los listados. Si solo quieres dejar de usarlo, mejor desactívalo."
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

function CategoryDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: NonNullable<Editing>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ name: string }>({
    resolver: zodResolver(createExpenseCategorySchema),
    defaultValues: { name: editing.mode === 'rename' ? editing.category.name : '' },
  });

  const save = useMutation({
    mutationFn: ({ name }: { name: string }) =>
      editing.mode === 'rename'
        ? updateExpenseCategory(editing.category.id, { name })
        : createExpenseCategory({ name }),
    onSuccess: async () => {
      toast.success(editing.mode === 'rename' ? 'Departamento renombrado' : 'Departamento creado');
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
      title={editing.mode === 'rename' ? 'Renombrar departamento' : 'Nuevo departamento'}
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
