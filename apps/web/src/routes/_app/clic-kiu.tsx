import {
  type ClickiuFilters,
  type ClickiuMovement,
  type ClickiuMovementType,
  clickiuMovementTypeSchema,
  clickiuSaleStatusSchema,
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
import { MovementFilters } from '@/components/clickiu/movement-filters';
import { MovementFormDialog } from '@/components/clickiu/movement-form-dialog';
import { MovementsTable } from '@/components/clickiu/movements-table';
import { SummaryCards } from '@/components/clickiu/summary-cards';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  clickiuKeys,
  deleteClickiuMovement,
  getClickiuSummary,
  listClickiuMovements,
  updateClickiuMovement,
} from '@/lib/clickiu-api';
import { errorMessage } from '@/lib/error-messages.es';

export const Route = createFileRoute('/_app/clic-kiu')({
  // Los filtros van en la URL (CA-18); un valor inválido se ignora en vez de romper la página.
  validateSearch: z.object({
    from: isoDateSchema.optional().catch(undefined),
    to: isoDateSchema.optional().catch(undefined),
    type: clickiuMovementTypeSchema.optional().catch(undefined),
    status: clickiuSaleStatusSchema.optional().catch(undefined),
  }),
  component: ClickiuPage,
});

/** Sin fechas en la URL se muestra el mes actual, igual que el valor por defecto de la API. */
function withMonth(f: ClickiuFilters): ClickiuFilters {
  if (f.from || f.to) return f;
  const { year, month } = parseIsoDate(todayIn());
  return {
    ...f,
    from: formatIsoDate({ year, month, day: 1 }),
    to: formatIsoDate({ year, month, day: daysInMonth(year, month) }),
  };
}

type Editing = { type: ClickiuMovementType; movement: ClickiuMovement | null };

/** Saldo de Clic Kiu (F11 CA-16 a CA-20): tarjetas, filtros, movimientos y alta. */
function ClickiuPage() {
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const filters = withMonth(Route.useSearch());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<ClickiuMovement | null>(null);

  const movements = useQuery({
    queryKey: clickiuKeys.movements(filters),
    queryFn: () => listClickiuMovements(filters),
  });
  const summary = useQuery({
    queryKey: clickiuKeys.summary(filters),
    queryFn: () => getClickiuSummary(filters),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: clickiuKeys.all });

  const complete = useMutation({
    mutationFn: (m: ClickiuMovement) => updateClickiuMovement(m.id, { status: 'completed' }),
    onSuccess: async () => {
      toast.success('Venta marcada como completada');
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (m: ClickiuMovement) => deleteClickiuMovement(m.id),
    onSuccess: async () => {
      toast.success('Movimiento eliminado');
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        title="Clic Kiu"
        description="Recargas y ventas del saldo de Clic Kiu."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEditing({ type: 'recharge', movement: null });
              }}
            >
              <Plus />
              Nueva recarga
            </Button>
            <Button
              onClick={() => {
                setEditing({ type: 'sale', movement: null });
              }}
            >
              <Plus />
              Nueva venta
            </Button>
          </>
        }
      />
      <SummaryCards summary={summary.data} {...(filters.to ? { to: filters.to } : {})} />
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
        onComplete={(m) => {
          complete.mutate(m);
        }}
        onEdit={(m) => {
          setEditing({ type: m.type, movement: m });
        }}
        onDelete={setDeleting}
      />
      {editing && summary.data && (
        <MovementFormDialog
          type={editing.type}
          movement={editing.movement}
          currentBalance={summary.data.currentBalance}
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
        title="¿Eliminar este movimiento?"
        description="Si es una recarga, solo se puede si el saldo no queda negativo."
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
