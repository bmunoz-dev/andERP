import { type FixedPayment, formatCOP } from '@anderp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { FormField } from '@/components/form-field';
import { SelectField } from '@/components/select-field';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-messages.es';
import { expenseKeys } from '@/lib/expenses-api';
import { feePaymentKeys, MONTHS } from '@/lib/fee-payments-api';
import {
  deleteFixedPayment,
  fixedPaymentKeys,
  getFixedPayment,
  listFixedPayments,
} from '@/lib/fixed-payments-api';
import { formatDate } from '@/lib/format';
import { providerKeys } from '@/lib/providers-api';
import { FixedPaymentFormDialog } from './fixed-payment-form-dialog';

/**
 * Pestaña "Monto fijo" de Pagos (F16 CA-21). `editId` llega del libro de egresos y abre ese pago;
 * `creating` lo controla el botón "Nuevo pago" de la página.
 */
export function FixedPaymentsTab({
  year,
  month,
  onPeriodChange,
  creating,
  onCreatingChange,
  editId,
  onEditDone,
}: {
  year: number;
  month: number;
  onPeriodChange: (year: number, month: number) => void;
  creating: boolean;
  onCreatingChange: (creating: boolean) => void;
  editId: string | undefined;
  onEditDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<FixedPayment | null>(null);
  const [deleting, setDeleting] = useState<FixedPayment | null>(null);
  const filters = { periodYear: year, periodMonth: month };
  const payments = useQuery({
    queryKey: fixedPaymentKeys.list(filters),
    queryFn: () => listFixedPayments(filters),
    enabled: year >= 2000 && year <= 2100,
  });
  const linked = useQuery({
    queryKey: fixedPaymentKeys.detail(editId ?? ''),
    queryFn: () => getFixedPayment(editId ?? ''),
    enabled: editId !== undefined,
  });
  const current = editing ?? linked.data ?? null;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: fixedPaymentKeys.all });
    await queryClient.invalidateQueries({ queryKey: feePaymentKeys.all });
    await queryClient.invalidateQueries({ queryKey: ['contracts'] });
    await queryClient.invalidateQueries({ queryKey: providerKeys.all });
    await queryClient.invalidateQueries({ queryKey: expenseKeys.all });
  }

  const remove = useMutation({
    mutationFn: (p: FixedPayment) => deleteFixedPayment(p.id),
    onSuccess: async () => {
      toast.success('Pago eliminado');
      await refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns: ColumnDef<FixedPayment>[] = [
    {
      id: 'provider',
      header: 'Persona',
      cell: ({ row }) => <span className="font-medium">{row.original.serviceProvider.name}</span>,
    },
    {
      id: 'period',
      header: 'Mes trabajado',
      cell: ({ row }) =>
        `${MONTHS[row.original.periodMonth - 1] ?? ''} ${String(row.original.periodYear)}`,
    },
    {
      id: 'paymentDate',
      header: 'Fecha de pago',
      cell: ({ row }) => formatDate(row.original.paymentDate),
    },
    { id: 'amount', header: 'Valor', cell: ({ row }) => formatCOP(row.original.amount) },
    {
      id: 'actions',
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Editar pago"
            onClick={() => {
              setEditing(row.original);
            }}
          >
            <Pencil />
          </Button>
          <Button
            variant="destructive-ghost"
            size="icon"
            aria-label="Eliminar pago"
            onClick={() => {
              setDeleting(row.original);
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <FormField
          label="Año"
          type="number"
          min={2000}
          max={2100}
          value={year}
          onChange={(e) => {
            onPeriodChange(Number(e.target.value), month);
          }}
        />
        <SelectField
          label="Mes trabajado"
          placeholder="Mes"
          value={String(month)}
          onChange={(v) => {
            onPeriodChange(year, Number(v));
          }}
          options={MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))}
        />
      </div>
      <DataTable
        columns={columns}
        data={payments.data}
        isLoading={payments.isPending}
        emptyMessage="No hay pagos de monto fijo en ese mes."
        getRowId={(p) => p.id}
      />
      {(creating || current) && (
        <FixedPaymentFormDialog
          key={current?.id ?? 'new'}
          year={year}
          month={month}
          payment={current}
          onClose={() => {
            onCreatingChange(false);
            setEditing(null);
            if (editId) onEditDone();
          }}
          onSaved={refresh}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="¿Eliminar este pago?"
        description="Deja de sumar en lo pagado del mes y en egresos, y queda registrado en la auditoría."
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
