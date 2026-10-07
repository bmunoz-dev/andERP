import { type FeePayment, todayIn, weekOfMonth, weekRange } from '@anderp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { SelectField } from '@/components/select-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-messages.es';
import {
  createFeePayment,
  feePaymentKeys,
  listOverlappingContracts,
  MONTHS,
  updateFeePayment,
} from '@/lib/fee-payments-api';
import { formatDate } from '@/lib/format';
import { providerKeys } from '@/lib/providers-api';
import { type DayValues, WeekGrid } from './week-grid';

function initialDays(payment: FeePayment | undefined): DayValues {
  return Object.fromEntries(
    (payment?.days ?? []).map((d) => [d.workDate, { amount: d.amount, isHoliday: d.isHoliday }]),
  );
}

/**
 * Alta y edición de un pago semanal (F04 CA-19): 1) año, mes y semana; 2) contrato vigente en esa
 * semana; 3) cuadrícula de días; 4) fecha de pago y notas. Al editar, contrato y semana quedan fijos.
 */
export function FeePaymentForm({
  payment,
  onSaved,
}: {
  payment?: FeePayment;
  onSaved: (payment: FeePayment) => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const today = todayIn();
  const [year, setYear] = useState(payment?.periodYear ?? Number(today.slice(0, 4)));
  const [month, setMonth] = useState(payment?.periodMonth ?? Number(today.slice(5, 7)));
  const [week, setWeek] = useState(payment?.weekOfMonth ?? weekOfMonth(today));
  const [contractId, setContractId] = useState(payment?.contractId ?? '');
  const [paymentDate, setPaymentDate] = useState(payment?.paymentDate ?? today);
  const [notes, setNotes] = useState(payment?.notes ?? '');
  const [days, setDays] = useState<DayValues>(() => initialDays(payment));
  const [error, setError] = useState<string | null>(null);

  const editing = payment !== undefined;
  const validYear = Number.isInteger(year) && year >= 2000 && year <= 2100;
  const range = validYear ? weekRange(year, month, week) : null;

  const contracts = useQuery({
    queryKey: feePaymentKeys.contracts(range?.start ?? '', range?.end ?? ''),
    queryFn: () => listOverlappingContracts(range?.start ?? '', range?.end ?? ''),
    enabled: range !== null,
  });
  const contract = contracts.data?.find((c) => c.id === contractId);
  const noContracts = !editing && contracts.data?.length === 0;

  const save = useMutation({
    mutationFn: () => {
      if (!range) throw new Error('Unreachable: invalid period');
      const body = {
        contractId,
        periodYear: year,
        periodMonth: month,
        weekOfMonth: week,
        paymentDate,
        notes: notes.trim() === '' ? null : notes,
        // Solo los días con valor y dentro de la semana elegida.
        days: Object.entries(days).flatMap(([workDate, d]) =>
          d.amount && workDate >= range.start && workDate <= range.end
            ? [{ workDate, amount: d.amount, isHoliday: d.isHoliday }]
            : [],
        ),
      };
      return payment ? updateFeePayment(payment.id, body) : createFeePayment(body);
    },
    onSuccess: async (saved) => {
      toast.success(editing ? 'Pago actualizado' : 'Pago registrado');
      await queryClient.invalidateQueries({ queryKey: feePaymentKeys.all });
      await queryClient.invalidateQueries({ queryKey: providerKeys.all });
      await onSaved(saved);
    },
    onError: (e) => {
      setError(errorMessage(e));
    },
  });

  return (
    <form
      className="grid gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        save.mutate();
      }}
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <FormField
          label="Año"
          type="number"
          min={2000}
          max={2100}
          disabled={editing}
          value={year}
          onChange={(e) => {
            setYear(Number(e.target.value));
          }}
        />
        <SelectField
          label="Mes"
          placeholder="Mes"
          disabled={editing}
          value={String(month)}
          onChange={(v) => {
            setMonth(Number(v));
          }}
          options={MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))}
        />
        <SelectField
          label="Semana"
          placeholder="Semana"
          disabled={editing}
          value={String(week)}
          onChange={(v) => {
            setWeek(Number(v));
          }}
          options={[1, 2, 3, 4].map((w) => ({
            value: String(w),
            label: validYear
              ? `Semana ${String(w)} (${formatDate(weekRange(year, month, w).start).slice(0, 5)} – ${formatDate(weekRange(year, month, w).end).slice(0, 5)})`
              : `Semana ${String(w)}`,
          }))}
        />
      </section>

      <SelectField
        label="Prestador (contrato vigente en esa semana)"
        disabled={editing || noContracts}
        placeholder={
          contracts.isPending
            ? 'Cargando…'
            : noContracts
              ? 'Ningún prestador tiene contrato vigente en esa semana'
              : 'Elige un prestador'
        }
        value={contractId}
        onChange={setContractId}
        options={(contracts.data ?? []).map((c) => ({
          value: c.id,
          label: `${c.serviceProvider.name} · desde ${formatDate(c.startDate)}`,
        }))}
      />
      {noContracts && (
        <p className="-mt-4 text-sm text-muted-foreground">
          Solo aparecen prestadores cuyo contrato cubre algún día de la semana elegida. Revisa las
          fechas del contrato en Prestadores o elige otra semana.
        </p>
      )}
      {editing && (
        <p className="-mt-4 text-xs text-muted-foreground">
          El contrato y la semana de un pago no se cambian. Para corregirlos, elimina el pago y
          créalo de nuevo.
        </p>
      )}

      {range && contract && (
        <WeekGrid
          start={range.start}
          end={range.end}
          contractStart={contract.startDate}
          contractEnd={contract.endDate}
          values={days}
          onChange={setDays}
        />
      )}

      <section className="grid gap-4 sm:grid-cols-[14rem_1fr]">
        <FormField
          label="Fecha de pago"
          type="date"
          value={paymentDate}
          onChange={(e) => {
            setPaymentDate(e.target.value);
          }}
        />
        <div className="grid gap-2">
          <Label htmlFor="fee-payment-notes">Notas (opcional)</Label>
          <Textarea
            id="fee-payment-notes"
            rows={2}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending || !contract}>
          {save.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar pago'}
        </Button>
      </div>
    </form>
  );
}
