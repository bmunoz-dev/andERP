import { todayIn } from '@anderp/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { ExpenseFormDialog } from '@/components/expenses/expense-form-dialog';
import { ExpenseMatrix } from '@/components/expenses/expense-matrix';
import { LedgerSheet } from '@/components/expenses/ledger-sheet';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { listExpenseCategories, queryKeys } from '@/lib/admin-api';
import { errorMessage } from '@/lib/error-messages.es';
import { expenseKeys, getMonthlyMatrix, type LedgerFilter } from '@/lib/expenses-api';
import { MONTHS } from '@/lib/fee-payments-api';

export const Route = createFileRoute('/_app/egresos')({
  // El mes va en la URL (`?y=2026&m=9`) para poder compartir el enlace.
  validateSearch: z.object({
    y: z.coerce.number().int().min(2000).max(2100).optional().catch(undefined),
    m: z.coerce.number().int().min(1).max(12).optional().catch(undefined),
  }),
  component: ExpensesPage,
});

type Editing = Parameters<typeof ExpenseFormDialog>[0]['expense'];

/** Pantalla principal (F05 CA-14): matriz del mes, detalle del libro y alta de egresos. */
function ExpensesPage() {
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const today = todayIn();
  const year = search.y ?? Number(today.slice(0, 4));
  const month = search.m ?? Number(today.slice(5, 7));
  const [selection, setSelection] = useState<{ filter: LedgerFilter; title: string } | null>(null);
  // undefined: formulario cerrado; null: egreso nuevo.
  const [editing, setEditing] = useState<Editing | undefined>(undefined);

  const matrix = useQuery({
    queryKey: expenseKeys.monthly(year, month),
    queryFn: () => getMonthlyMatrix(year, month),
  });
  const categories = useQuery({
    queryKey: queryKeys.expenseCategories,
    queryFn: listExpenseCategories,
  });

  function goTo(offset: number) {
    const index = year * 12 + month - 1 + offset;
    void navigate({ search: { y: Math.floor(index / 12), m: (index % 12) + 1 } });
  }

  return (
    <>
      <PageHeader
        title="Egresos"
        description="Egresos del mes por departamento y semana, incluidos los honorarios pagados."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
            }}
          >
            <Plus />
            Nuevo egreso
          </Button>
        }
      />
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Mes anterior"
          onClick={() => {
            goTo(-1);
          }}
        >
          <ChevronLeft />
        </Button>
        <p className="min-w-40 text-center font-medium capitalize">
          {MONTHS[month - 1]} {year}
        </p>
        <Button
          variant="outline"
          size="icon"
          aria-label="Mes siguiente"
          onClick={() => {
            goTo(1);
          }}
        >
          <ChevronRight />
        </Button>
      </div>
      {matrix.isPending && <Skeleton className="h-64 w-full" />}
      {matrix.isError && <p className="text-destructive">{errorMessage(matrix.error)}</p>}
      {matrix.data && (
        <div className="rounded-lg border">
          <ExpenseMatrix
            matrix={matrix.data}
            onSelect={(filter, title) => {
              setSelection({ filter, title });
            }}
          />
        </div>
      )}
      <LedgerSheet
        year={year}
        month={month}
        selection={selection}
        onClose={() => {
          setSelection(null);
        }}
        onEdit={(entry) => {
          setEditing({ ...entry, id: entry.sourceId });
        }}
      />
      {editing !== undefined && (
        <ExpenseFormDialog
          year={year}
          month={month}
          expense={editing}
          categories={categories.data ?? []}
          onClose={() => {
            setEditing(undefined);
          }}
          onSaved={() => queryClient.invalidateQueries({ queryKey: expenseKeys.all })}
        />
      )}
    </>
  );
}
