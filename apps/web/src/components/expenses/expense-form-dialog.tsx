import {
  type Expense,
  type ExpenseCategory,
  isoDateSchema,
  type SaveExpense,
  saveExpenseSchema,
  todayIn,
  weekOfMonth,
  weekRange,
} from '@anderp/shared';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { MoneyInput } from '@/components/money-input';
import { SelectField } from '@/components/select-field';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/error-messages.es';
import { categoryOptions, createExpense, updateExpense } from '@/lib/expenses-api';
import { formatDate } from '@/lib/format';

type ExpenseValues = Omit<Expense, 'weekOfMonth'>;
type Errors = Partial<Record<keyof ExpenseValues, string>>;

/**
 * Alta y edición de un egreso (F05 CA-15). La semana acota el calendario a su rango y, al elegir
 * una fecha, la semana se ajusta sola.
 */
export function ExpenseFormDialog({
  year,
  month,
  expense,
  categories,
  onClose,
  onSaved,
}: {
  /** Mes que se está viendo; al editar manda el de la fecha del egreso. */
  year: number;
  month: number;
  expense: ExpenseValues | null;
  categories: ExpenseCategory[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const today = todayIn();
  const initialDate =
    expense?.paymentDate ??
    (today.startsWith(`${String(year)}-${String(month).padStart(2, '0')}`) ? today : '');
  const [period, setPeriod] = useState(() =>
    expense
      ? {
          year: Number(expense.paymentDate.slice(0, 4)),
          month: Number(expense.paymentDate.slice(5, 7)),
        }
      : { year, month },
  );
  const [week, setWeek] = useState<number>(initialDate ? weekOfMonth(initialDate) : 1);
  const [paymentDate, setPaymentDate] = useState(initialDate);
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? '');
  const [concept, setConcept] = useState(expense?.concept ?? '');
  const [invoiceNumber, setInvoiceNumber] = useState(expense?.invoiceNumber ?? '');
  const [amount, setAmount] = useState<string | null>(expense?.amount ?? null);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const amountId = useId();
  const range = weekRange(period.year, period.month, week);

  const save = useMutation({
    mutationFn: (body: SaveExpense) =>
      expense ? updateExpense(expense.id, body) : createExpense(body),
    onSuccess: async () => {
      toast.success(expense ? 'Egreso actualizado' : 'Egreso registrado');
      await onSaved();
      onClose();
    },
    onError: (e) => {
      setError(errorMessage(e));
    },
  });

  function submit() {
    const parsed = saveExpenseSchema.safeParse({
      categoryId,
      concept,
      invoiceNumber,
      paymentDate,
      amount: amount ?? '',
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={expense ? 'Editar egreso' : 'Nuevo egreso'}
      description="Los honorarios se registran en su propia sección."
      error={error}
      submitLabel="Guardar"
      isSubmitting={save.isPending}
      onSubmit={submit}
    >
      <SelectField
        label="Departamento"
        placeholder="Elige"
        value={categoryId}
        onChange={setCategoryId}
        options={categoryOptions(categories, expense?.categoryId ?? null)}
        error={errors.categoryId}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Semana"
          placeholder="Elige"
          value={String(week)}
          onChange={(v) => {
            const next = weekRange(period.year, period.month, Number(v));
            setWeek(Number(v));
            if (paymentDate < next.start || paymentDate > next.end) setPaymentDate('');
          }}
          options={[1, 2, 3, 4].map((w) => {
            const r = weekRange(period.year, period.month, w);
            return {
              value: String(w),
              label: `Semana ${String(w)} · ${formatDate(r.start).slice(0, 5)} – ${formatDate(r.end).slice(0, 5)}`,
            };
          })}
        />
        <FormField
          label="Fecha de pago"
          type="date"
          min={range.start}
          max={range.end}
          value={paymentDate}
          error={errors.paymentDate}
          onChange={(e) => {
            const value = e.target.value;
            setPaymentDate(value);
            if (isoDateSchema.safeParse(value).success) {
              setPeriod({ year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) });
              setWeek(weekOfMonth(value));
            }
          }}
        />
      </div>
      <FormField
        label="Concepto"
        value={concept}
        error={errors.concept}
        onChange={(e) => {
          setConcept(e.target.value);
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Factura (opcional)"
          value={invoiceNumber}
          maxLength={40}
          error={errors.invoiceNumber}
          onChange={(e) => {
            setInvoiceNumber(e.target.value);
          }}
        />
        <div className="grid gap-2">
          <Label htmlFor={amountId}>Valor</Label>
          <MoneyInput
            id={amountId}
            placeholder="0"
            value={amount}
            onChange={setAmount}
            aria-invalid={errors.amount ? true : undefined}
          />
          {errors.amount && <p className="text-sm text-destructive">{errors.amount}</p>}
        </div>
      </div>
    </FormDialog>
  );
}
