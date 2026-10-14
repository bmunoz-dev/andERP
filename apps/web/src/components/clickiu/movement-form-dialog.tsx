import {
  type ClickiuMovement,
  type ClickiuMovementType,
  type ClickiuSaleStatus,
  formatCOP,
  type SaveClickiuMovement,
  saveClickiuMovementSchema,
  sumMoney,
  todayIn,
} from '@anderp/shared';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { MoneyInput } from '@/components/money-input';
import { SelectField } from '@/components/select-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { createClickiuMovement, updateClickiuMovement } from '@/lib/clickiu-api';
import { errorMessage } from '@/lib/error-messages.es';

type Errors = Partial<Record<'movementDate' | 'amount' | 'description', string>>;

const TITLES = {
  recharge: { create: 'Nueva recarga', edit: 'Editar recarga', saved: 'Recarga guardada' },
  sale: { create: 'Nueva venta', edit: 'Editar venta', saved: 'Venta guardada' },
};

/**
 * Alta y edición de un movimiento de Clic Kiu (F11 CA-20). El tipo llega fijo: no cambia (CA-3).
 * El aviso de saldo es solo una ayuda; la regla la aplica la base de datos.
 */
export function MovementFormDialog({
  type,
  movement,
  currentBalance,
  onClose,
  onSaved,
}: {
  type: ClickiuMovementType;
  movement: ClickiuMovement | null;
  currentBalance: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [movementDate, setMovementDate] = useState(movement?.movementDate ?? todayIn());
  const [amount, setAmount] = useState<string | null>(movement?.amount ?? null);
  const [status, setStatus] = useState<ClickiuSaleStatus>(movement?.status ?? 'credit');
  const [description, setDescription] = useState(movement?.description ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const amountId = useId();
  const isSale = type === 'sale';
  const titles = TITLES[type];

  // Al editar una venta, su monto original vuelve a estar disponible.
  const available =
    movement && isSale ? sumMoney([currentBalance, movement.amount]) : currentBalance;
  const remaining = amount ? sumMoney([available, `-${amount}`]) : available;
  const overBy = remaining.startsWith('-') ? remaining.slice(1) : null;

  const save = useMutation({
    mutationFn: (body: SaveClickiuMovement) =>
      movement ? updateClickiuMovement(movement.id, body) : createClickiuMovement(body),
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
    const parsed = saveClickiuMovementSchema.safeParse({
      type,
      status: isSale ? status : null,
      movementDate,
      amount: amount ?? '',
      description,
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
      {isSale && (
        <>
          <SelectField
            label="Estado"
            placeholder="Elige"
            value={status}
            onChange={(v) => {
              setStatus(v as ClickiuSaleStatus);
            }}
            options={[
              { value: 'credit', label: 'Crédito' },
              { value: 'completed', label: 'Completado' },
            ]}
          />
          <p className="text-sm text-muted-foreground" data-testid="available-balance">
            Saldo disponible: {formatCOP(available)}
          </p>
          {overBy && (
            <Alert className="border-amber-500/50 text-amber-700 dark:text-amber-400">
              <AlertDescription>
                Supera el saldo disponible en {formatCOP(overBy)}.
              </AlertDescription>
            </Alert>
          )}
        </>
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
