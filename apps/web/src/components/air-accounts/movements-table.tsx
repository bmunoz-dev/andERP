import { type AirMovement, formatCOP } from '@anderp/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { CircleCheck, Pencil, Trash2 } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AIR_MOVEMENT_LABELS } from '@/lib/air-accounts-api';
import { formatDate } from '@/lib/format';

/** Monto con su efecto en el saldo: `−` en emisiones y saldos iniciales negativos, `+` en el resto. */
function SignedMovement({ movement }: { movement: AirMovement }) {
  const { amount } = movement;
  if (movement.type === 'issue' || amount.startsWith('-')) {
    return <span>− {formatCOP(amount.replace('-', ''))}</span>;
  }
  return <span className="text-emerald-700 dark:text-emerald-400">+ {formatCOP(amount)}</span>;
}

/** Tabla de movimientos de una cuenta aérea (F18 CA-30). */
export function MovementsTable({
  data,
  isLoading,
  onCollect,
  onEdit,
  onDelete,
}: {
  data: AirMovement[] | undefined;
  isLoading: boolean;
  onCollect: (m: AirMovement) => void;
  onEdit: (m: AirMovement) => void;
  onDelete: (m: AirMovement) => void;
}) {
  const columns: ColumnDef<AirMovement>[] = [
    { id: 'date', header: 'Fecha', cell: ({ row }) => formatDate(row.original.movementDate) },
    { id: 'type', header: 'Tipo', cell: ({ row }) => AIR_MOVEMENT_LABELS[row.original.type] },
    {
      id: 'amount',
      header: 'Monto',
      cell: ({ row }) => <SignedMovement movement={row.original} />,
    },
    { id: 'pnr', header: 'PNR', cell: ({ row }) => row.original.pnr ?? '' },
    { id: 'ticket', header: 'Tiquete', cell: ({ row }) => row.original.ticketNumber ?? '' },
    { id: 'passenger', header: 'Pasajero', cell: ({ row }) => row.original.passenger ?? '' },
    {
      id: 'collection',
      header: 'Estado de cobro',
      cell: ({ row }) => {
        const { collectionStatus } = row.original;
        if (!collectionStatus) return '—';
        return collectionStatus === 'pending' ? (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Por cobrar</Badge>
        ) : (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            Cobrado
          </Badge>
        );
      },
    },
    { id: 'description', header: 'Descripción', cell: ({ row }) => row.original.description ?? '' },
    {
      id: 'actions',
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          {row.original.collectionStatus === 'pending' && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Marcar como cobrado"
              title="Marcar como cobrado"
              onClick={() => {
                onCollect(row.original);
              }}
            >
              <CircleCheck />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Editar movimiento"
            onClick={() => {
              onEdit(row.original);
            }}
          >
            <Pencil />
          </Button>
          <Button
            variant="destructive-ghost"
            size="icon"
            aria-label="Eliminar movimiento"
            onClick={() => {
              onDelete(row.original);
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      emptyMessage="No hay movimientos con estos filtros."
      getRowId={(m) => m.id}
    />
  );
}
