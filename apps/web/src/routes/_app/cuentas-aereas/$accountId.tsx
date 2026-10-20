import {
  type AirMovement,
  type AirMovementFilters,
  type AirMovementType,
  airCollectionStatusSchema,
  airMovementTypeSchema,
  daysInMonth,
  formatIsoDate,
  isoDateSchema,
  parseIsoDate,
  todayIn,
} from '@anderp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { IssueFormDialog } from '@/components/air-accounts/issue-form-dialog';
import { MovementFilters } from '@/components/air-accounts/movement-filters';
import { MovementFormDialog } from '@/components/air-accounts/movement-form-dialog';
import { MovementSummaryCards } from '@/components/air-accounts/movement-summary-cards';
import { MovementsTable } from '@/components/air-accounts/movements-table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AIR_MOVEMENT_LABELS,
  airKeys,
  deleteAirMovement,
  getAirAccount,
  getAirMovementSummary,
  isPrepaid,
  listAirMovements,
  updateAirMovement,
} from '@/lib/air-accounts-api';
import { errorMessage } from '@/lib/error-messages.es';

export const Route = createFileRoute('/_app/cuentas-aereas/$accountId')({
  // Los filtros van en la URL (CA-29); un valor inválido se ignora en vez de romper la página.
  validateSearch: z.object({
    from: isoDateSchema.optional().catch(undefined),
    to: isoDateSchema.optional().catch(undefined),
    type: airMovementTypeSchema.optional().catch(undefined),
    collectionStatus: airCollectionStatusSchema.optional().catch(undefined),
  }),
  component: AirAccountPage,
});

/** Sin fechas en la URL se muestra el mes actual, igual que el valor por defecto de la API. */
function withMonth(f: AirMovementFilters): AirMovementFilters {
  if (f.from || f.to) return f;
  const { year, month } = parseIsoDate(todayIn());
  return {
    ...f,
    from: formatIsoDate({ year, month, day: 1 }),
    to: formatIsoDate({ year, month, day: daysInMonth(year, month) }),
  };
}

type Editing = { type: AirMovementType; movement: AirMovement | null };

/** Movimientos de una cuenta aérea (F18 CA-29 a CA-32). */
function AirAccountPage() {
  const { accountId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const filters = withMonth(Route.useSearch());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<AirMovement | null>(null);

  const account = useQuery({
    queryKey: airKeys.account(accountId),
    queryFn: () => getAirAccount(accountId),
  });
  const movements = useQuery({
    queryKey: airKeys.movements(accountId, filters),
    queryFn: () => listAirMovements(accountId, filters),
  });
  const summary = useQuery({
    queryKey: airKeys.summary(accountId, filters),
    queryFn: () => getAirMovementSummary(accountId, filters),
  });
  // CA-31: "Saldo inicial" solo si la cuenta aún no tiene uno (en cualquier fecha).
  const openingFilters: AirMovementFilters = { type: 'opening_balance', from: '1900-01-01' };
  const opening = useQuery({
    queryKey: airKeys.movements(accountId, openingFilters),
    queryFn: () => listAirMovements(accountId, openingFilters),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: airKeys.all });

  const collect = useMutation({
    mutationFn: (m: AirMovement) =>
      updateAirMovement(accountId, m.id, { collectionStatus: 'collected' }),
    onSuccess: async () => {
      toast.success('Emisión marcada como cobrada');
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (m: AirMovement) => deleteAirMovement(accountId, m.id),
    onSuccess: async () => {
      toast.success('Movimiento eliminado');
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const open = (type: AirMovementType) => () => {
    setEditing({ type, movement: null });
  };
  const canAdd = account.data?.isActive ?? false;
  const entries: Exclude<AirMovementType, 'issue' | 'opening_balance'>[] = [
    'recharge',
    'payment',
    'refund',
  ];

  return (
    <>
      <PageHeader
        title={account.data?.name ?? 'Cuenta aérea'}
        description={
          account.data
            ? `${account.data.operatorName} · ${isPrepaid(account.data) ? 'Prepago' : 'Crédito'}${account.data.isActive ? '' : ' · Inactiva'}`
            : ''
        }
        actions={
          canAdd && (
            <>
              {opening.data?.length === 0 && (
                <Button variant="outline" onClick={open('opening_balance')}>
                  <Plus />
                  Saldo inicial
                </Button>
              )}
              {entries.map((type) => (
                <Button key={type} variant="outline" onClick={open(type)}>
                  <Plus />
                  {AIR_MOVEMENT_LABELS[type]}
                </Button>
              ))}
              <Button onClick={open('issue')}>
                <Plus />
                Emitir tiquete
              </Button>
            </>
          )
        }
      />
      <MovementSummaryCards summary={summary.data} {...(filters.to ? { to: filters.to } : {})} />
      <Card className="mb-6">
        <CardContent>
          <MovementFilters
            value={filters}
            onChange={(next) => {
              void navigate({ search: next });
            }}
          />
        </CardContent>
      </Card>
      <MovementsTable
        data={movements.data}
        isLoading={movements.isPending}
        onCollect={(m) => {
          collect.mutate(m);
        }}
        onEdit={(m) => {
          setEditing({ type: m.type, movement: m });
        }}
        onDelete={setDeleting}
      />
      {editing?.type === 'issue' && summary.data && (
        <IssueFormDialog
          accountId={accountId}
          movement={editing.movement}
          available={summary.data.available}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={refresh}
        />
      )}
      {editing && editing.type !== 'issue' && (
        <MovementFormDialog
          accountId={accountId}
          type={editing.type}
          movement={editing.movement}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={refresh}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleting(null);
        }}
        title="¿Eliminar este movimiento?"
        description="Si es una entrada de dinero, solo se puede si la cuenta no queda sin saldo ni sobre su cupo."
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
