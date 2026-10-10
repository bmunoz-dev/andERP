import { formatCOP, PAYMENT_FREQUENCY_LABELS, type ServiceProvider } from '@anderp/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { ProviderFormDialog } from '@/components/providers/provider-form-dialog';
import { SelectField } from '@/components/select-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listProviders, providerKeys, type ProviderFilters } from '@/lib/providers-api';

export const Route = createFileRoute('/_app/prestadores/')({
  component: ProvidersPage,
});

const columns: ColumnDef<ServiceProvider>[] = [
  {
    accessorKey: 'name',
    header: 'Prestador',
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <Link
          to="/prestadores/$id"
          params={{ id: row.original.id }}
          className="font-medium underline-offset-4 hover:underline"
        >
          {row.original.name}
        </Link>
        {!row.original.isActive && <Badge variant="secondary">Inactivo</Badge>}
      </span>
    ),
  },
  {
    id: 'document',
    header: 'Documento',
    cell: ({ row }) => `${row.original.documentType.code} ${row.original.documentNumber}`,
  },
  {
    id: 'bank',
    header: 'Cuenta',
    cell: ({ row }) =>
      row.original.bank ? (
        <span>
          {row.original.bank.name}
          <span className="text-muted-foreground"> · {row.original.accountType?.name}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">Sin cuenta</span>
      ),
  },
  {
    id: 'contract',
    header: 'Contrato vigente',
    cell: ({ row }) => {
      const contract = row.original.activeContract;
      if (!contract) return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex items-center gap-2">
          <Badge>Vigente</Badge>
          <span className="text-sm">
            {formatCOP(contract.totalAmount)} ·{' '}
            {PAYMENT_FREQUENCY_LABELS[contract.paymentFrequency]}
          </span>
        </div>
      );
    },
  },
];

function ProvidersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [hasActiveContract, setHasActiveContract] =
    useState<ProviderFilters['hasActiveContract']>('all');
  const [creating, setCreating] = useState(false);
  // La búsqueda consulta la API con el texto ya "asentado", no en cada tecla.
  const filters: ProviderFilters = { search: useDeferredValue(search), hasActiveContract };
  const providers = useQuery({
    queryKey: providerKeys.list(filters),
    queryFn: () => listProviders(filters),
  });

  return (
    <>
      <PageHeader
        title="Prestadores de servicios"
        description="Personas y empresas a las que se pagan honorarios, con sus contratos."
        actions={
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            <Plus />
            Nuevo prestador
          </Button>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-[1fr_16rem] sm:items-end">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar por nombre o documento"
            placeholder="Buscar por nombre o documento"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
          />
        </div>
        <SelectField
          label="Contrato"
          placeholder="Todos"
          value={hasActiveContract}
          onChange={(v) => {
            setHasActiveContract(v as ProviderFilters['hasActiveContract']);
          }}
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'yes', label: 'Con contrato vigente' },
            { value: 'no', label: 'Sin contrato vigente' },
          ]}
        />
      </div>
      <DataTable
        columns={columns}
        data={providers.data}
        isLoading={providers.isPending}
        emptyMessage={
          search ? 'Ningún prestador coincide con la búsqueda.' : 'Aún no hay prestadores.'
        }
        getRowId={(p) => p.id}
      />
      {creating && (
        <ProviderFormDialog
          provider={null}
          onClose={() => {
            setCreating(false);
          }}
          onSaved={async (saved) => {
            await queryClient.invalidateQueries({ queryKey: providerKeys.all });
            await navigate({ to: '/prestadores/$id', params: { id: saved.id } });
          }}
        />
      )}
    </>
  );
}
