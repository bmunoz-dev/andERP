import { type AirAccount, formatCOP } from '@anderp/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isPrepaid } from '@/lib/air-accounts-api';

/** Monto en COP, en rojo si es negativo (una deuda con el operador). */
export function SignedAmount({ value }: { value: string }) {
  return (
    <span className={value.startsWith('-') ? 'text-destructive tabular-nums' : 'tabular-nums'}>
      {formatCOP(value)}
    </span>
  );
}

/** Tabla de cuentas aéreas (F18 CA-28). `renderName` permite enlazar el nombre a sus movimientos. */
export function AccountsTable({
  data,
  isLoading,
  onEdit,
  onToggle,
  renderName = (a) => a.name,
}: {
  data: AirAccount[] | undefined;
  isLoading: boolean;
  onEdit: (account: AirAccount) => void;
  onToggle: (account: AirAccount) => void;
  renderName?: (account: AirAccount) => ReactNode;
}) {
  const columns: ColumnDef<AirAccount>[] = [
    { accessorKey: 'operatorName', header: 'Operador' },
    {
      id: 'name',
      header: 'Cuenta',
      cell: ({ row }) => (
        <span className="flex items-center gap-2 font-medium">
          {renderName(row.original)}
          {!row.original.isActive && <Badge variant="outline">Inactiva</Badge>}
        </span>
      ),
    },
    {
      id: 'mode',
      header: 'Modalidad',
      cell: ({ row }) =>
        isPrepaid(row.original) ? (
          <Badge variant="secondary">Prepago</Badge>
        ) : (
          <Badge variant="outline">Crédito</Badge>
        ),
    },
    {
      id: 'balance',
      header: 'Saldo',
      cell: ({ row }) => <SignedAmount value={row.original.balance} />,
    },
    {
      id: 'creditLimit',
      header: 'Cupo',
      cell: ({ row }) => formatCOP(row.original.creditLimit),
    },
    {
      id: 'available',
      header: 'Disponible',
      cell: ({ row }) => <SignedAmount value={row.original.available} />,
    },
    {
      id: 'pendingCollection',
      header: 'Por cobrar',
      cell: ({ row }) => formatCOP(row.original.pendingCollection),
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
              onEdit(row.original);
            }}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onToggle(row.original);
            }}
          >
            {row.original.isActive ? 'Desactivar' : 'Activar'}
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
      emptyMessage="Aún no hay cuentas aéreas."
      getRowId={(a) => a.id}
    />
  );
}
