import {
  type Contract,
  isoDateSchema,
  PAYMENT_FREQUENCY_LABELS,
  paymentFrequencySchema,
  positiveMoneySchema,
} from '@anderp/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { MoneyInput } from '@/components/money-input';
import { SelectField } from '@/components/select-field';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-messages.es';
import { createContract, updateContract } from '@/lib/providers-api';

const contractForm = z
  .object({
    startDate: isoDateSchema,
    // Vacío = contrato sin fecha de fin.
    endDate: z.union([z.literal(''), isoDateSchema]),
    paymentFrequency: paymentFrequencySchema,
    monthlyAmount: positiveMoneySchema
      .nullable()
      .refine((v) => v !== null, 'Ingresa un valor válido'),
    workAgreement: z.string().trim().min(1, 'Describe el acuerdo de trabajo').max(5000),
  })
  .refine((v) => v.endDate === '' || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'La fecha de fin no puede ser anterior a la de inicio',
  });
// Entrada: el valor puede ser null mientras el campo está vacío. Salida: string ya validado.
type ContractFormInput = z.input<typeof contractForm>;
type ContractForm = z.output<typeof contractForm>;

const frequencyOptions = Object.entries(PAYMENT_FREQUENCY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function ContractFormDialog({
  providerId,
  contract,
  onClose,
  onSaved,
}: {
  providerId: string;
  contract: Contract | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const amountId = useId();
  const agreementId = useId();
  const form = useForm<ContractFormInput, unknown, ContractForm>({
    resolver: zodResolver(contractForm),
    defaultValues: {
      startDate: contract?.startDate ?? '',
      endDate: contract?.endDate ?? '',
      paymentFrequency: contract?.paymentFrequency ?? 'weekly',
      monthlyAmount: contract?.monthlyAmount ?? null,
      workAgreement: contract?.workAgreement ?? '',
    },
  });
  const { errors } = form.formState;

  const save = useMutation({
    mutationFn: (values: ContractForm) => {
      const body = {
        startDate: values.startDate,
        endDate: values.endDate === '' ? null : values.endDate,
        paymentFrequency: values.paymentFrequency,
        monthlyAmount: values.monthlyAmount,
        workAgreement: values.workAgreement,
      };
      return contract ? updateContract(contract.id, body) : createContract(providerId, body);
    },
    onSuccess: async () => {
      toast.success(contract ? 'Contrato actualizado' : 'Contrato creado');
      await onSaved();
      onClose();
    },
    onError: (e) => {
      setError(errorMessage(e));
    },
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={contract ? 'Editar contrato' : 'Nuevo contrato'}
      description="Si el contrato no tiene fecha de fin, deja ese campo vacío."
      error={error}
      submitLabel="Guardar"
      isSubmitting={save.isPending}
      onSubmit={() =>
        void form.handleSubmit((values) => {
          save.mutate(values);
        })()
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Fecha de inicio"
          type="date"
          error={errors.startDate?.message}
          {...form.register('startDate')}
        />
        <FormField
          label="Fecha de fin (opcional)"
          type="date"
          error={errors.endDate?.message}
          {...form.register('endDate')}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={form.control}
          name="paymentFrequency"
          render={({ field }) => (
            <SelectField
              label="Periodicidad de pago"
              placeholder="Elige"
              value={field.value}
              onChange={(v) => {
                field.onChange(v);
              }}
              options={frequencyOptions}
              error={errors.paymentFrequency?.message}
            />
          )}
        />
        <div className="grid gap-2">
          <Label htmlFor={amountId}>Monto mensual</Label>
          <Controller
            control={form.control}
            name="monthlyAmount"
            render={({ field }) => (
              <MoneyInput
                id={amountId}
                placeholder="0"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                aria-invalid={errors.monthlyAmount ? true : undefined}
              />
            )}
          />
          {errors.monthlyAmount && (
            <p className="text-sm text-destructive">{errors.monthlyAmount.message}</p>
          )}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={agreementId}>Acuerdo de trabajo</Label>
        <Textarea
          id={agreementId}
          rows={3}
          aria-invalid={errors.workAgreement ? true : undefined}
          {...form.register('workAgreement')}
        />
        {errors.workAgreement && (
          <p className="text-sm text-destructive">{errors.workAgreement.message}</p>
        )}
      </div>
    </FormDialog>
  );
}
