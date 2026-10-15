import type { Obligation, ObligationStatus } from '@anderp/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { CircleCheck, History, Pencil, Trash2 } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { dueText, FREQUENCY_LABELS, STATUS_LABELS } from '@/lib/obligations-api';

const STATUS_CLASSES: Record<ObligationStatus, string> = {
  overdue: 'bg-destructive text-white',
  upcoming: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  scheduled: 'bg-muted text-muted-foreground',
  none: 'border-border bg-transparent text-muted-foreground',
};

/** Tabla de la agenda (F13 CA-18). */
export function AgendaTable({
  data,
  isLoading,
  onComplete,
  onHistory,
  onEdit,
  onDelete,
}: {
  data: Obligation[] | undefined;
  isLoading: boolean;
  onComplete: (o: Obligation) => void;
  onHistory: (o: Obligation) => void;
  onEdit: (o: Obligation) => void;
  onDelete: (o: Obligation) => void;
}) {
  const columns: ColumnDef<Obligation>[] = [
    {
      id: 'status',
      header: 'Estado',
      cell: ({ row }) => (
        <Badge className={STATUS_CLASSES[row.original.status]}>
          {STATUS_LABELS[row.original.status]}
        </Badge>
      ),
    },
    {
      id: 'entity',
      header: 'Entidad',
      cell: ({ row }) => <span className="font-medium">{row.original.entityName}</span>,
    },
    { id: 'concept', header: 'Concepto', cell: ({ row }) => row.original.concept },
    {
      id: 'frequency',
      header: 'Periodicidad',
      cell: ({ row }) => FREQUENCY_LABELS[row.original.frequency],
    },
    {
      id: 'due',
      header: 'Vence',
      cell: ({ row }) => {
        const { pending, daysLeft } = row.original;
        if (!pending || daysLeft === null) return '—';
        return (
          <div>
            <div>{formatDate(pending.dueDate)}</div>
            <div className="text-xs text-muted-foreground">{dueText(daysLeft)}</div>
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          {row.original.pending && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Completar"
              title="Completar"
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
            aria-label="Historial"
            title="Historial"
            onClick={() => {
              onHistory(row.original);
            }}
          >
            <History />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Editar obligación"
            onClick={() => {
              onEdit(row.original);
            }}
          >
            <Pencil />
          </Button>
          <Button
            variant="destructive-ghost"
            size="icon"
            aria-label="Eliminar obligación"
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
      emptyMessage="No hay obligaciones en esta vista."
      getRowId={(o) => o.id}
    />
  );
}
