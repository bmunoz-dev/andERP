import { type Contract, formatCOP, PAYMENT_FREQUENCY_LABELS } from '@anderp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ContractStatusBadge } from '@/components/contract-status-badge';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { ContractFormDialog } from '@/components/providers/contract-form-dialog';
import { ProviderFormDialog } from '@/components/providers/provider-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { errorMessage } from '@/lib/error-messages.es';
import { formatDate } from '@/lib/format';
import {
  deleteContract,
  deleteProvider,
  getProvider,
  listContracts,
  providerKeys,
  updateProvider,
} from '@/lib/providers-api';

export const Route = createFileRoute('/_app/prestadores/$id')({
  component: ProviderDetailPage,
});

type ContractEditing = { contract: Contract | null } | null;

function ProviderDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const provider = useQuery({ queryKey: providerKeys.detail(id), queryFn: () => getProvider(id) });
  const contracts = useQuery({
    queryKey: providerKeys.contracts(id),
    queryFn: () => listContracts(id),
  });
  const [editingProvider, setEditingProvider] = useState(false);
  const [deletingProvider, setDeletingProvider] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [editingContract, setEditingContract] = useState<ContractEditing>(null);
  const [deletingContract, setDeletingContract] = useState<Contract | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: providerKeys.all });
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const removeProvider = useMutation({
    mutationFn: () => deleteProvider(id),
    onSuccess: async () => {
      toast.success('Prestador eliminado');
      await refresh();
      await navigate({ to: '/prestadores' });
    },
    onError,
  });

  // F09: un prestador inactivo no recibe contratos nuevos; los triggers aplican las reglas.
  const setActive = useMutation({
    mutationFn: (isActive: boolean) => updateProvider(id, { isActive }),
    onSuccess: (saved) => {
      toast.success(saved.isActive ? 'Prestador activado' : 'Prestador desactivado');
      return refresh();
    },
    onError,
  });

  const removeContract = useMutation({
    mutationFn: (c: Contract) => deleteContract(c.id),
    onSuccess: () => {
      toast.success('Contrato eliminado');
      return refresh();
    },
    onError,
  });

  const columns: ColumnDef<Contract>[] = [
    {
      id: 'period',
      header: 'Periodo',
      cell: ({ row }) =>
        `${formatDate(row.original.startDate)} – ${
          row.original.endDate ? formatDate(row.original.endDate) : 'sin fecha de fin'
        }`,
    },
    {
      id: 'frequency',
      header: 'Pago',
      cell: ({ row }) => PAYMENT_FREQUENCY_LABELS[row.original.paymentFrequency],
    },
    {
      id: 'amount',
      header: 'Valor total',
      cell: ({ row }) => formatCOP(row.original.totalAmount),
    },
    {
      id: 'paid',
      header: 'Pagado',
      cell: ({ row }) => formatCOP(row.original.paidAmount),
    },
    {
      id: 'balance',
      header: 'Saldo',
      cell: ({ row }) => (
        <span className={row.original.balance.startsWith('-') ? 'text-destructive' : undefined}>
          {formatCOP(row.original.balance)}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: ({ row }) => <ContractStatusBadge status={row.original.status} />,
    },
    {
      id: 'agreement',
      header: 'Acuerdo',
      cell: ({ row }) => (
        <span className="line-clamp-2 max-w-xs text-sm text-muted-foreground">
          {row.original.workAgreement}
        </span>
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
            aria-label="Editar contrato"
            onClick={() => {
              setEditingContract({ contract: row.original });
            }}
          >
            <Pencil />
          </Button>
          <Button
            variant="destructive-ghost"
            size="icon"
            aria-label="Eliminar contrato"
            onClick={() => {
              setDeletingContract(row.original);
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ];

  if (provider.isError) {
    return (
      <>
        <PageHeader title="Prestador" />
        <p className="text-muted-foreground">{errorMessage(provider.error)}</p>
      </>
    );
  }

  const p = provider.data;
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/prestadores">
          <ArrowLeft />
          Prestadores
        </Link>
      </Button>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p?.name ?? 'Prestador'}
            {p && !p.isActive && <Badge variant="secondary">Inactivo</Badge>}
          </span>
        }
        {...(p ? { description: `${p.documentType.code} ${p.documentNumber}` } : {})}
        actions={
          p && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingProvider(true);
                }}
              >
                <Pencil />
                Editar
              </Button>
              <Button
                variant="outline"
                disabled={setActive.isPending}
                onClick={() => {
                  if (p.isActive) setDeactivating(true);
                  else setActive.mutate(true);
                }}
              >
                {p.isActive ? <PowerOff /> : <Power />}
                {p.isActive ? 'Desactivar' : 'Activar'}
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  setDeletingProvider(true);
                }}
              >
                <Trash2 />
                Eliminar
              </Button>
            </>
          )
        }
      />

      {p && (
        <Card className="mb-8">
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Cuenta bancaria</p>
              <p>
                {p.bank
                  ? `${p.bank.name} · ${p.accountType?.name ?? ''} · ${p.accountNumber ?? ''}`
                  : 'Sin cuenta registrada'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Descripción</p>
              <p>{p.description ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Contratos</h2>
        {p?.isActive !== false && (
          <Button
            onClick={() => {
              setEditingContract({ contract: null });
            }}
          >
            <Plus />
            Nuevo contrato
          </Button>
        )}
      </div>
      {p && !p.isActive && (
        <p className="mb-4 text-sm text-muted-foreground">
          Prestador inactivo: no se le pueden crear contratos nuevos. Sus contratos y pagos se
          conservan, y se pueden registrar pagos atrasados. Actívalo para crear un contrato.
        </p>
      )}
      <DataTable
        columns={columns}
        data={contracts.data}
        isLoading={contracts.isPending}
        emptyMessage="Este prestador aún no tiene contratos."
        getRowId={(c) => c.id}
      />

      {editingProvider && p && (
        <ProviderFormDialog
          provider={p}
          onClose={() => {
            setEditingProvider(false);
          }}
          onSaved={refresh}
        />
      )}
      {editingContract && (
        <ContractFormDialog
          providerId={id}
          contract={editingContract.contract}
          onClose={() => {
            setEditingContract(null);
          }}
          onSaved={refresh}
        />
      )}
      <ConfirmDialog
        open={deletingProvider}
        onOpenChange={setDeletingProvider}
        title={`¿Eliminar a ${p?.name ?? 'este prestador'}?`}
        description="Solo se puede eliminar un prestador sin contratos."
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          removeProvider.mutate();
          setDeletingProvider(false);
        }}
      />
      <ConfirmDialog
        open={deactivating}
        onOpenChange={setDeactivating}
        title={`¿Desactivar a ${p?.name ?? 'este prestador'}?`}
        description="No se le podrán crear contratos nuevos. Su historial se conserva y se puede volver a activar."
        confirmLabel="Desactivar"
        onConfirm={() => {
          setActive.mutate(false);
          setDeactivating(false);
        }}
      />
      <ConfirmDialog
        open={deletingContract !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingContract(null);
        }}
        title="¿Eliminar este contrato?"
        description="Deja de aparecer en el listado y queda registrado en la auditoría."
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          if (deletingContract) removeContract.mutate(deletingContract);
          setDeletingContract(null);
        }}
      />
    </>
  );
}
