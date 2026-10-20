import {
  type AirMovement,
  type AirMovementType,
  createAirMovementSchema,
  todayIn,
} from '@anderp/shared';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { MoneyInput } from '@/components/money-input';
import { Label } from '@/components/ui/label';
import { createAirMovement, updateAirMovement } from '@/lib/air-accounts-api';
import { errorMessage } from '@/lib/error-messages.es';

type EntryType = Exclude<AirMovementType, 'issue'>;

const TITLES: Record<EntryType, { create: string; edit: string; saved: string }> = {
  opening_balance: {
    create: 'Saldo inicial',
    edit: 'Editar saldo inicial',
    saved: 'Saldo inicial guardado',
  },
  recharge: { create: 'Nueva recarga', edit: 'Editar recarga', saved: 'Recarga guardada' },
  payment: {
    create: 'Nuevo pago al operador',
    edit: 'Editar pago al operador',
    saved: 'Pago guardado',
  },
  refund: { create: 'Nuevo reembolso', edit: 'Editar reembolso', saved: 'Reembolso guardado' },
};

/**
 * Recarga, pago al operador, reembolso o saldo inicial (F18 CA-31). El tipo llega fijo. El saldo
 * inicial se escribe en positivo y se elige si es a favor o una deuda, en vez de teclear el signo.
 */
export function MovementFormDialog({
  accountId,
  type,
  movement,
  onClose,
  onSaved,
}: {
  accountId: string;
  type: EntryType;
  movement: AirMovement | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isOpening = type === 'opening_balance';
  const [movementDate, setMovementDate] = useState(movement?.movementDate ?? todayIn());
  const [amount, setAmount] = useState<string | null>(movement?.amount.replace('-', '') ?? null);
  const [inDebt, setInDebt] = useState(movement?.amount.startsWith('-') ?? false);
  const [description, setDescription] = useState(movement?.description ?? '');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const amountId = useId();
  const titles = TITLES[type];

  const save = useMutation({
    mutationFn: (send: () => Promise<AirMovement>) => send(),
    onSuccess: async () => {
      toast.success(titles.saved);
      await onSaved();
      onClose();
    },
    onError: (e) => {
      setError(errorMessage(e));
    },
  });

  function submit() {
    const signed = amount && isOpening && inDebt ? `-${amount}` : (amount ?? '');
    const parsed = createAirMovementSchema.safeParse({
      type,
      movementDate,
      amount: signed,
      description,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    const { type: _, ...changes } = parsed.data;
    save.mutate(() =>
      movement
        ? updateAirMovement(accountId, movement.id, changes)
        : createAirMovement(accountId, parsed.data),
    );
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={movement ? titles.edit : titles.create}
      error={error}
      submitLabel="Guardar"
      isSubmitting={save.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Fecha"
          type="date"
          value={movementDate}
          error={errors.movementDate}
          onChange={(e) => {
            setMovementDate(e.target.value);
          }}
        />
        <div className="grid gap-2">
          <Label htmlFor={amountId}>Monto</Label>
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
      {isOpening && (
        <fieldset className="flex gap-6 text-sm">
          <legend className="sr-only">El saldo inicial es</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="opening-sign"
              checked={!inDebt}
              onChange={() => {
                setInDebt(false);
              }}
            />
            A favor
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="opening-sign"
              checked={inDebt}
              onChange={() => {
                setInDebt(true);
              }}
            />
            En deuda
          </label>
        </fieldset>
      )}
      <FormField
        label="Descripción (opcional)"
        value={description}
        maxLength={500}
        error={errors.description}
        onChange={(e) => {
          setDescription(e.target.value);
        }}
      />
    </FormDialog>
  );
}
