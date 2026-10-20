import { type AirAccount, type AirOperator, saveAirAccountSchema } from '@anderp/shared';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { MoneyInput } from '@/components/money-input';
import { SelectField } from '@/components/select-field';
import { Label } from '@/components/ui/label';
import { createAirAccount, updateAirAccount } from '@/lib/air-accounts-api';
import { errorMessage } from '@/lib/error-messages.es';

type Errors = Partial<Record<'operatorId' | 'name' | 'creditLimit', string>>;

/**
 * Alta y edición de una cuenta aérea (F18 CA-28). Se eligen los operadores activos; al editar
 * también aparece el actual aunque esté inactivo, para no perderlo del selector.
 */
export function AccountFormDialog({
  account,
  operators,
  onClose,
  onSaved,
}: {
  account: AirAccount | null;
  operators: AirOperator[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [operatorId, setOperatorId] = useState(account?.operatorId ?? '');
  const [name, setName] = useState(account?.name ?? '');
  const [creditLimit, setCreditLimit] = useState<string | null>(account?.creditLimit ?? '0.00');
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const limitId = useId();

  const options = operators
    .filter((o) => o.isActive || o.id === account?.operatorId)
    .map((o) => ({ value: o.id, label: o.name }));

  const save = useMutation({
    mutationFn: (body: { operatorId: string; name: string; creditLimit: string }) =>
      account ? updateAirAccount(account.id, body) : createAirAccount(body),
    onSuccess: async () => {
      toast.success(account ? 'Cuenta actualizada' : 'Cuenta creada');
      await onSaved();
      onClose();
    },
    onError: (e) => {
      setError(errorMessage(e));
    },
  });

  function submit() {
    const parsed = saveAirAccountSchema.safeParse({
      operatorId,
      name,
      creditLimit: creditLimit ?? '',
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
      title={account ? 'Editar cuenta' : 'Nueva cuenta'}
      error={error}
      submitLabel="Guardar"
      isSubmitting={save.isPending}
      onSubmit={submit}
    >
      <SelectField
        label="Operador"
        placeholder="Elige un operador"
        value={operatorId}
        onChange={setOperatorId}
        options={options}
        error={errors.operatorId && 'Elige un operador'}
      />
      <FormField
        label="Nombre de la cuenta"
        placeholder="KIU — Sucursal Bogotá"
        value={name}
        maxLength={120}
        error={errors.name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <div className="grid gap-2">
        <Label htmlFor={limitId}>Límite de crédito</Label>
        <MoneyInput
          id={limitId}
          placeholder="0"
          value={creditLimit}
          onChange={setCreditLimit}
          aria-invalid={errors.creditLimit ? true : undefined}
        />
        <p className="text-sm text-muted-foreground">0 = prepago (la cuenta no puede deber).</p>
        {errors.creditLimit && <p className="text-sm text-destructive">{errors.creditLimit}</p>}
      </div>
    </FormDialog>
  );
}
