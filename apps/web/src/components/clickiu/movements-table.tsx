import { type ClickiuMovement, formatCOP } from '@anderp/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { CircleCheck, Pencil, Trash2 } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';

/** Tabla de movimientos de Clic Kiu (F11 CA-19). */
export function MovementsTable({
  data,
  isLoading,
  onComplete,
  onEdit,
  onDelete,
}: {
  data: ClickiuMovement[] | undefined;
  isLoading: boolean;
  onComplete: (m: ClickiuMovement) => void;
  onEdit: (m: ClickiuMovement) => void;
  onDelete: (m: ClickiuMovement) => void;
}) {
  const columns: ColumnDef<ClickiuMovement>[] = [
    { id: 'date', header: 'Fecha', cell: ({ row }) => formatDate(row.original.movementDate) },
    {
      id: 'type',
      header: 'Tipo',
      cell: ({ row }) => (row.original.type === 'recharge' ? 'Recarga' : 'Venta'),
    },
    {
      id: 'amount',
      header: 'Monto',
      cell: ({ row }) =>
        row.original.type === 'recharge' ? (
          <span className="text-emerald-700 dark:text-emerald-400">
            + {formatCOP(row.original.amount)}
          </span>
        ) : (
          <span>− {formatCOP(row.original.amount)}</span>
        ),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: ({ row }) => {
        const { status } = row.original;
        if (!status) return '—';
        return status === 'credit' ? (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Crédito</Badge>
        ) : (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            Completado
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
          {row.original.status === 'credit' && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Marcar como completado"
              title="Marcar como completado"
              onClick={() => {
                onComplete(row.original);
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
