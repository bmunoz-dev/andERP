import { type FeePayment, formatCOP, todayIn } from '@anderp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { SelectField } from '@/components/select-field';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-messages.es';
import { expenseKeys } from '@/lib/expenses-api';
import { deleteFeePayment, feePaymentKeys, listFeePayments, MONTHS } from '@/lib/fee-payments-api';
import { formatDate } from '@/lib/format';
import { providerKeys } from '@/lib/providers-api';

export const Route = createFileRoute('/_app/honorarios/')({
  component: FeePaymentsPage,
});

function FeePaymentsPage() {
  const queryClient = useQueryClient();
  const today = todayIn();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [week, setWeek] = useState(0);
  const [deleting, setDeleting] = useState<FeePayment | null>(null);
  const filters = { periodYear: year, periodMonth: month, weekOfMonth: week };
  const payments = useQuery({
    queryKey: feePaymentKeys.list(filters),
    queryFn: () => listFeePayments(filters),
    enabled: year >= 2000 && year <= 2100,
  });

  const remove = useMutation({
    mutationFn: (p: FeePayment) => deleteFeePayment(p.id),
    onSuccess: async () => {
      toast.success('Pago eliminado');
      await queryClient.invalidateQueries({ queryKey: feePaymentKeys.all });
      await queryClient.invalidateQueries({ queryKey: providerKeys.all });
      await queryClient.invalidateQueries({ queryKey: expenseKeys.all });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns: ColumnDef<FeePayment>[] = [
    {
      id: 'provider',
      header: 'Prestador',
      cell: ({ row }) => <span className="font-medium">{row.original.serviceProvider.name}</span>,
    },
    {
      id: 'week',
      header: 'Semana trabajada',
      cell: ({ row }) =>
        `Semana ${String(row.original.weekOfMonth)} · ${formatDate(row.original.periodStart).slice(0, 5)} – ${formatDate(row.original.periodEnd)}`,
    },
    {
      id: 'paymentDate',
      header: 'Fecha de pago',
      cell: ({ row }) => formatDate(row.original.paymentDate),
    },
    { id: 'days', header: 'Días', cell: ({ row }) => row.original.days.length },
    { id: 'total', header: 'Total', cell: ({ row }) => formatCOP(row.original.total) },
    {
      id: 'actions',
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Editar pago">
            <Link to="/honorarios/$id" params={{ id: row.original.id }}>
              <Pencil />
            </Link>
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
      <PageHeader
        title="Pagos de honorarios"
        description="Pagos semanales a prestadores, con el valor de cada día trabajado."
        actions={
          <Button asChild>
            <Link to="/honorarios/nuevo">
              <Plus />
              Nuevo pago
            </Link>
          </Button>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <FormField
          label="Año"
          type="number"
          min={2000}
          max={2100}
          value={year}
          onChange={(e) => {
            setYear(Number(e.target.value));
          }}
        />
        <SelectField
          label="Mes"
          placeholder="Mes"
          value={String(month)}
          onChange={(v) => {
            setMonth(Number(v));
          }}
          options={MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))}
        />
        <SelectField
          label="Semana"
          placeholder="Todas"
          value={String(week)}
          onChange={(v) => {
            setWeek(Number(v));
          }}
          options={[
            { value: '0', label: 'Todas' },
            ...[1, 2, 3, 4].map((w) => ({ value: String(w), label: `Semana ${String(w)}` })),
          ]}
        />
      </div>
      <DataTable
        columns={columns}
        data={payments.data}
        isLoading={payments.isPending}
        emptyMessage="No hay pagos en ese periodo."
        getRowId={(p) => p.id}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="¿Eliminar este pago?"
        description="Deja de sumar en el saldo del contrato y queda registrado en la auditoría."
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
