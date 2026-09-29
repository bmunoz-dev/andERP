import type { CatalogItem, CatalogKind } from '@anderp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/data-table';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createCatalogItem, listCatalog, queryKeys, updateCatalogItem } from '@/lib/admin-api';
import { errorMessage } from '@/lib/error-messages.es';

export const Route = createFileRoute('/_app/plataforma/catalogos')({
  component: CatalogsPage,
});

const TABS: { kind: CatalogKind; label: string; singular: string }[] = [
  { kind: 'banks', label: 'Bancos', singular: 'banco' },
  { kind: 'account-types', label: 'Tipos de cuenta', singular: 'tipo de cuenta' },
  { kind: 'document-types', label: 'Tipos de documento', singular: 'tipo de documento' },
];

function CatalogsPage() {
  return (
    <>
      <PageHeader
        title="Catálogos"
        description="Valores compartidos por todas las organizaciones. Desactivar uno lo quita de las listas sin afectar los registros que ya lo usan."
      />
      <Tabs defaultValue="banks">
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.kind} value={tab.kind}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((tab) => (
          <TabsContent key={tab.kind} value={tab.kind} className="pt-4">
            <CatalogTab kind={tab.kind} singular={tab.singular} />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

type Editing = { item: CatalogItem | null } | null;

function CatalogTab({ kind, singular }: { kind: CatalogKind; singular: string }) {
  const queryClient = useQueryClient();
  const items = useQuery({
    queryKey: queryKeys.catalog(kind, true),
    queryFn: () => listCatalog(kind, true),
  });
  const [editing, setEditing] = useState<Editing>(null);
  const hasCode = kind === 'document-types';

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.catalogs });

  const toggle = useMutation({
    mutationFn: (item: CatalogItem) =>
      updateCatalogItem(kind, item.id, { isActive: !item.isActive }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns: ColumnDef<CatalogItem>[] = [
    ...(hasCode
      ? [{ accessorKey: 'code', header: 'Código' } satisfies ColumnDef<CatalogItem>]
      : []),
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
              setEditing({ item: row.original });
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
      <div className="mb-4 flex justify-end">
        <Button
          variant="outline"
          onClick={() => {
            setEditing({ item: null });
          }}
        >
          <Plus />
          Agregar {singular}
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={items.data}
        isLoading={items.isPending}
        emptyMessage="Sin valores."
        getRowId={(item) => item.id}
      />
      {editing && (
        <CatalogItemDialog
          kind={kind}
          singular={singular}
          item={editing.item}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={refresh}
        />
      )}
    </>
  );
}

function CatalogItemDialog({
  kind,
  singular,
  item,
  onClose,
  onSaved,
}: {
  kind: CatalogKind;
  singular: string;
  item: CatalogItem | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const hasCode = kind === 'document-types';
  const [name, setName] = useState(item?.name ?? '');
  const [code, setCode] = useState(item?.code ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = hasCode ? { name, code } : { name };
      return item ? updateCatalogItem(kind, item.id, body) : createCatalogItem(kind, body);
    },
    onSuccess: async () => {
      toast.success(item ? 'Cambios guardados' : 'Valor agregado');
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
      title={item ? `Editar ${singular}` : `Agregar ${singular}`}
      error={error}
      submitLabel="Guardar"
      isSubmitting={save.isPending}
      onSubmit={() => {
        save.mutate();
      }}
    >
      {hasCode && (
        <FormField
          label="Código"
          placeholder="CC"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
          }}
        />
      )}
      <FormField
        label="Nombre"
        autoFocus={!hasCode}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
    </FormDialog>
  );
}
