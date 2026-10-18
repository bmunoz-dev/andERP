import { type Contract, formatCOP, PAYMENT_MODE_LABELS } from '@anderp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowLeft,
  Eye,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ContractStatusBadge } from '@/components/contract-status-badge';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { ContractDetailSheet } from '@/components/providers/contract-detail-sheet';
import { ContractFormDialog } from '@/components/providers/contract-form-dialog';
import { ProviderFormDialog } from '@/components/providers/provider-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent } from '@/components/ui/card';
import { errorMessage } from '@/lib/error-messages.es';
import { formatContractPeriod } from '@/lib/format';
import {
  deleteContract,
  deleteProvider,
  getProvider,
  listContracts,
  providerKeys,
  updateProvider,
} from '@/lib/providers-api';

export const Route = createFileRoute('/_app/personal/$id')({
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
  // El panel lee el contrato de la consulta: al cambiar su documento se actualiza (CA-17b).
  const [viewingContractId, setViewingContractId] = useState<string | null>(null);
  const viewingContract = contracts.data?.find((c) => c.id === viewingContractId) ?? null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: providerKeys.all });
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const removeProvider = useMutation({
    mutationFn: () => deleteProvider(id),
    onSuccess: async () => {
      toast.success('Persona eliminada');
      await refresh();
      await navigate({ to: '/personal' });
    },
    onError,
  });

  // F09: una persona inactiva no recibe contratos nuevos; los triggers aplican las reglas.
  const setActive = useMutation({
    mutationFn: (isActive: boolean) => updateProvider(id, { isActive }),
    onSuccess: (saved) => {
      toast.success(saved.isActive ? 'Persona activada' : 'Persona desactivada');
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

  // F17 CA-17: solo lo esencial; el resto del contrato y su documento van en el panel de detalle.
  const columns: ColumnDef<Contract>[] = [
    {
      id: 'period',
      header: 'Periodo',
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-2">
          {formatContractPeriod(row.original)}
          <ContractStatusBadge status={row.original.status} />
        </span>
      ),
    },
    {
      id: 'mode',
      header: 'Forma de pago',
      cell: ({ row }) => PAYMENT_MODE_LABELS[row.original.paymentMode],
    },
    {
      id: 'month',
      header: 'Este mes',
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatCOP(row.original.paidThisMonth)}
          <span className="text-muted-foreground"> de {formatCOP(row.original.monthlyAmount)}</span>
        </span>
      ),
    },
    {
      id: 'document',
      header: 'Documento',
      cell: ({ row }) =>
        row.original.document ? (
          <span title={row.original.document.fileName}>
            <FileText className="size-4" aria-hidden="true" />
            <span className="sr-only">{row.original.document.fileName}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
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
            aria-label="Ver detalle del contrato"
            onClick={() => {
              setViewingContractId(row.original.id);
            }}
          >
            <Eye />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Más acciones del contrato">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setEditingContract({ contract: row.original });
                }}
              >
                <Pencil />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  setDeletingContract(row.original);
                }}
              >
                <Trash2 />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  if (provider.isError) {
    return (
      <>
        <PageHeader title="Persona" />
        <p className="text-muted-foreground">{errorMessage(provider.error)}</p>
      </>
    );
  }

  const p = provider.data;
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link to="/personal">
          <ArrowLeft />
          Personal
        </Link>
      </Button>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p?.name ?? 'Persona'}
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
          Persona inactiva: no se le pueden crear contratos nuevos. Sus contratos y pagos se
          conservan, y se pueden registrar pagos atrasados. Actívala para crear un contrato.
        </p>
      )}
      <DataTable
        columns={columns}
        data={contracts.data}
        isLoading={contracts.isPending}
        emptyMessage="Esta persona aún no tiene contratos."
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
      <ContractDetailSheet
        contract={viewingContract}
        onClose={() => {
          setViewingContractId(null);
        }}
        onEdit={(c) => {
          // Un modal a la vez: el formulario o la confirmación reemplazan al panel.
          setViewingContractId(null);
          setEditingContract({ contract: c });
        }}
        onDelete={(c) => {
          setViewingContractId(null);
          setDeletingContract(c);
        }}
        onChanged={refresh}
      />
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
        title={`¿Eliminar a ${p?.name ?? 'esta persona'}?`}
        description="Solo se puede eliminar una persona sin contratos."
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
        title={`¿Desactivar a ${p?.name ?? 'esta persona'}?`}
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
