import {
  type FixedPayment,
  formatCOP,
  saveFixedPaymentSchema,
  sumMoney,
  todayIn,
  weekRange,
} from '@anderp/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { MoneyInput } from '@/components/money-input';
import { SelectField } from '@/components/select-field';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/error-messages.es';
import { feePaymentKeys, listOverlappingContracts, MONTHS } from '@/lib/fee-payments-api';
import { createFixedPayment, updateFixedPayment } from '@/lib/fixed-payments-api';

type Errors = Partial<Record<'contractId' | 'periodYear' | 'paymentDate' | 'amount', string>>;

/**
 * Alta y edición de un pago de monto fijo (F16 CA-22). Al editar, el contrato y el mes trabajado
 * quedan fijos (CA-9). Lo pagado en el mes es una vista previa; la API suma en SQL.
 */
export function FixedPaymentFormDialog({
  year: initialYear,
  month: initialMonth,
  payment,
  onClose,
  onSaved,
}: {
  /** Mes que se está viendo; al editar manda el del pago. */
  year: number;
  month: number;
  payment: FixedPayment | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const editing = payment !== null;
  const [year, setYear] = useState(payment?.periodYear ?? initialYear);
  const [month, setMonth] = useState(payment?.periodMonth ?? initialMonth);
  const [contractId, setContractId] = useState(payment?.contractId ?? '');
  const [paymentDate, setPaymentDate] = useState(payment?.paymentDate ?? todayIn());
  const [amount, setAmount] = useState<string | null>(payment?.amount ?? null);
  const [notes, setNotes] = useState(payment?.notes ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const amountId = useId();

  const validYear = Number.isInteger(year) && year >= 2000 && year <= 2100;
  const start = validYear ? weekRange(year, month, 1).start : '';
  const end = validYear ? weekRange(year, month, 4).end : '';
  const contracts = useQuery({
    queryKey: feePaymentKeys.contracts(start, end, payment?.id),
    queryFn: () => listOverlappingContracts(start, end, payment?.id),
    select: (all) => all.filter((c) => c.paymentMode === 'fixed'),
    enabled: validYear,
  });
  const contract = contracts.data?.find((c) => c.id === contractId);
  const paidInMonth = contract ? sumMoney([contract.paidInMonth, amount ?? '0.00']) : null;

  const save = useMutation({
    mutationFn: () => {
      const body = { paymentDate, amount: amount ?? '', notes: notes.trim() === '' ? null : notes };
      if (payment) return updateFixedPayment(payment.id, body);
      return createFixedPayment({ ...body, contractId, periodYear: year, periodMonth: month });
    },
    onSuccess: async () => {
      toast.success(editing ? 'Pago actualizado' : 'Pago registrado');
      await onSaved();
      onClose();
    },
    onError: (e) => {
      setError(errorMessage(e));
    },
  });

  function submit() {
    const parsed = saveFixedPaymentSchema.safeParse({
      contractId,
      periodYear: year,
      periodMonth: month,
      paymentDate,
      amount: amount ?? '',
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setError(null);
    save.mutate();
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={editing ? 'Editar pago de monto fijo' : 'Nuevo pago de monto fijo'}
      description={
        editing
          ? 'La persona y el mes trabajado no se cambian. Para corregirlos, elimina el pago y créalo de nuevo.'
          : 'Puedes registrar varios pagos en el mismo mes (quincenas, anticipos).'
      }
      error={error}
      submitLabel="Guardar"
      isSubmitting={save.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Año trabajado"
          type="number"
          min={2000}
          max={2100}
          value={year}
          disabled={editing}
          error={errors.periodYear}
          onChange={(e) => {
            setYear(Number(e.target.value));
            setContractId('');
          }}
        />
        <SelectField
          label="Mes trabajado"
          placeholder="Mes"
          value={String(month)}
          disabled={editing}
          onChange={(v) => {
            setMonth(Number(v));
            setContractId('');
          }}
          options={MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))}
        />
      </div>
      <SelectField
        label="Persona"
        placeholder={
          contracts.data?.length === 0
            ? 'Nadie tiene un contrato de monto fijo en ese mes'
            : 'Elige una persona'
        }
        value={contractId}
        disabled={editing || contracts.data?.length === 0}
        onChange={setContractId}
        options={(contracts.data ?? []).map((c) => ({
          value: c.id,
          label: c.serviceProvider.name,
        }))}
        error={errors.contractId}
      />
      {contract && paidInMonth && (
        <p className="text-sm" data-testid="month-summary">
          Pagado en {MONTHS[month - 1]}: <strong>{formatCOP(paidInMonth)}</strong> de{' '}
          {formatCOP(contract.monthlyAmount)} (monto mensual del contrato)
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Fecha de pago"
          type="date"
          value={paymentDate}
          error={errors.paymentDate}
          onChange={(e) => {
            setPaymentDate(e.target.value);
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
      <FormField
        label="Notas (opcional)"
        value={notes}
        maxLength={1000}
        onChange={(e) => {
          setNotes(e.target.value);
        }}
      />
    </FormDialog>
  );
}
