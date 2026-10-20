import {
  type AirCollectionStatus,
  type AirMovement,
  createAirMovementSchema,
  formatCOP,
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
import { createAirMovement, updateAirMovement } from '@/lib/air-accounts-api';
import { errorMessage } from '@/lib/error-messages.es';

type Errors = Partial<Record<string, string>>;

/**
 * Emitir o editar un tiquete (F18 CA-31). El total es tarifa neta + impuestos; el aviso de cupo
 * es solo una ayuda: la regla la aplica la base de datos.
 */
export function IssueFormDialog({
  accountId,
  movement,
  available,
  onClose,
  onSaved,
}: {
  accountId: string;
  movement: AirMovement | null;
  available: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [movementDate, setMovementDate] = useState(movement?.movementDate ?? todayIn());
  const [pnr, setPnr] = useState(movement?.pnr ?? '');
  const [ticketNumber, setTicketNumber] = useState(movement?.ticketNumber ?? '');
  const [passenger, setPassenger] = useState(movement?.passenger ?? '');
  const [netFare, setNetFare] = useState<string | null>(movement?.netFare ?? null);
  const [taxes, setTaxes] = useState<string | null>(movement?.taxes ?? null);
  const [collectionStatus, setCollectionStatus] = useState<AirCollectionStatus>(
    movement?.collectionStatus ?? 'pending',
  );
  const [description, setDescription] = useState(movement?.description ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const netFareId = useId();
  const taxesId = useId();

  const total = sumMoney([netFare ?? '0.00', taxes ?? '0.00']);
  // Al editar, el monto original de la emisión vuelve a estar disponible.
  const availableNow = movement ? sumMoney([available, movement.amount]) : available;
  const remaining = sumMoney([availableNow, `-${total}`]);
  const overBy = remaining.startsWith('-') ? remaining.slice(1) : null;

  const save = useMutation({
    mutationFn: (send: () => Promise<AirMovement>) => send(),
    onSuccess: async () => {
      toast.success(movement ? 'Emisión actualizada' : 'Tiquete emitido');
      await onSaved();
      onClose();
    },
    onError: (e) => {
      setError(errorMessage(e));
    },
  });

  function submit() {
    // El formulario siempre trae el tiquete completo: se valida igual al crear y al editar.
    const parsed = createAirMovementSchema.safeParse({
      type: 'issue',
      movementDate,
      pnr,
      ticketNumber,
      passenger,
      netFare: netFare ?? '',
      taxes: taxes ?? '',
      collectionStatus,
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
      title={movement ? 'Editar emisión' : 'Emitir tiquete'}
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
        <FormField
          label="PNR"
          value={pnr}
          maxLength={6}
          className="uppercase"
          error={errors.pnr}
          onChange={(e) => {
            setPnr(e.target.value);
          }}
        />
        <FormField
          label="Número de tiquete"
          inputMode="numeric"
          value={ticketNumber}
          maxLength={13}
          error={errors.ticketNumber}
          onChange={(e) => {
            setTicketNumber(e.target.value);
          }}
        />
        <FormField
          label="Pasajero"
          value={passenger}
          maxLength={120}
          error={errors.passenger}
          onChange={(e) => {
            setPassenger(e.target.value);
          }}
        />
        <div className="grid gap-2">
          <Label htmlFor={netFareId}>Tarifa neta</Label>
          <MoneyInput
            id={netFareId}
            placeholder="0"
            value={netFare}
            onChange={setNetFare}
            aria-invalid={errors.netFare ? true : undefined}
          />
          {errors.netFare && <p className="text-sm text-destructive">{errors.netFare}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor={taxesId}>Impuestos</Label>
          <MoneyInput
            id={taxesId}
            placeholder="0"
            value={taxes}
            onChange={setTaxes}
            aria-invalid={errors.taxes ? true : undefined}
          />
          {errors.taxes && <p className="text-sm text-destructive">{errors.taxes}</p>}
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span data-testid="issue-total" className="font-medium">
          Total: {formatCOP(total)}
        </span>
        <span data-testid="issue-available" className="text-muted-foreground">
          Disponible: {formatCOP(availableNow)}
        </span>
      </div>
      {overBy && (
        <Alert className="border-amber-500/50 text-amber-700 dark:text-amber-400">
          <AlertDescription>Supera el disponible en {formatCOP(overBy)}.</AlertDescription>
        </Alert>
      )}
      <SelectField
        label="Estado de cobro"
        placeholder="Elige"
        value={collectionStatus}
        onChange={(v) => {
          setCollectionStatus(v as AirCollectionStatus);
        }}
        options={[
          { value: 'pending', label: 'Por cobrar' },
          { value: 'collected', label: 'Cobrado' },
        ]}
      />
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
