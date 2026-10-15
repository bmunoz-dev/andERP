import {
  createObligationSchema,
  type Obligation,
  type ObligationFrequency,
  updateObligationSchema,
} from '@anderp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { SelectField } from '@/components/select-field';
import { errorMessage } from '@/lib/error-messages.es';
import {
  createObligation,
  FREQUENCY_LABELS,
  obligationKeys,
  updateObligation,
} from '@/lib/obligations-api';

type Values = {
  entityName: string;
  concept: string;
  frequency: ObligationFrequency;
  noticeDays: string;
  notes: string;
  firstDueDate: string;
};

/**
 * Alta y edición de una obligación (F13 CA-19). La entidad sugiere las ya usadas con el
 * `<datalist>` nativo; el primer vencimiento solo se pide al crear.
 */
export function ObligationFormDialog({
  obligation,
  entities,
  onClose,
}: {
  obligation: Obligation | null;
  entities: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const listId = useId();
  const [values, setValues] = useState<Values>({
    entityName: obligation?.entityName ?? '',
    concept: obligation?.concept ?? '',
    frequency: obligation?.frequency ?? 'monthly',
    noticeDays: String(obligation?.noticeDays ?? 15),
    notes: obligation?.notes ?? '',
    firstDueDate: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      obligation
        ? updateObligation(obligation.id, updateObligationSchema.parse(body))
        : createObligation(createObligationSchema.parse(body)),
    onSuccess: async () => {
      toast.success(obligation ? 'Obligación actualizada' : 'Obligación creada');
      await queryClient.invalidateQueries({ queryKey: obligationKeys.all });
      onClose();
    },
    onError: (e) => {
      setError(errorMessage(e));
    },
  });

  function submit() {
    const { firstDueDate, ...rest } = values;
    const body = {
      ...rest,
      noticeDays: Number(values.noticeDays),
      ...(obligation ? {} : { firstDueDate }),
    };
    const parsed = (obligation ? updateObligationSchema : createObligationSchema).safeParse(body);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    save.mutate(body);
  }

  const field = (name: keyof Values, label: string, type = 'text') => (
    <FormField
      label={label}
      type={type}
      value={values[name]}
      error={errors[name]}
      onChange={(e) => {
        setValues({ ...values, [name]: e.target.value });
      }}
    />
  );

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={obligation ? 'Editar obligación' : 'Nueva obligación'}
      description="Solo la fecha límite y el aviso: el pago no se registra aquí."
      error={error}
      submitLabel="Guardar"
      isSubmitting={save.isPending}
      onSubmit={submit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Entidad"
          list={listId}
          placeholder="DIAN, Fontur…"
          value={values.entityName}
          error={errors.entityName}
          onChange={(e) => {
            setValues({ ...values, entityName: e.target.value });
          }}
        />
        <datalist id={listId}>
          {[...new Set(entities)].map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {field('concept', 'Concepto')}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Periodicidad"
          placeholder="Elige"
          value={values.frequency}
          onChange={(v) => {
            setValues({ ...values, frequency: v as ObligationFrequency });
          }}
          options={Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))}
        />
        {field('noticeDays', 'Días de aviso', 'number')}
      </div>
      {!obligation && field('firstDueDate', 'Primer vencimiento', 'date')}
      {field('notes', 'Notas (opcional)')}
    </FormDialog>
  );
}
