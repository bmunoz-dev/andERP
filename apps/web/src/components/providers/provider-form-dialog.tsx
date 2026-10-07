import { type CatalogItem, documentNumberSchema, type ServiceProvider } from '@anderp/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/form-dialog';
import { FormField } from '@/components/form-field';
import { SelectField, type SelectOption } from '@/components/select-field';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { listCatalog, queryKeys } from '@/lib/admin-api';
import { errorMessage } from '@/lib/error-messages.es';
import { createProvider, updateProvider } from '@/lib/providers-api';

const BANK_FIELDS = ['bankId', 'accountTypeId', 'accountNumber'] as const;

const providerForm = z
  .object({
    name: z.string().trim().min(1, 'Ingresa el nombre').max(100),
    documentTypeId: z.string().min(1, 'Elige el tipo de documento'),
    documentNumber: documentNumberSchema,
    description: z.string().trim().max(2000),
    bankId: z.string(),
    accountTypeId: z.string(),
    accountNumber: z
      .string()
      .trim()
      .refine((v) => v === '' || /^[0-9-]{4,30}$/.test(v), 'Usa de 4 a 30 números o guiones'),
  })
  .superRefine((values, ctx) => {
    // La cuenta va completa o no va (F03 CA-1): se marca el campo que falta.
    const filled = BANK_FIELDS.filter((field) => values[field] !== '');
    if (filled.length > 0 && filled.length < BANK_FIELDS.length) {
      for (const field of BANK_FIELDS.filter((f) => values[f] === '')) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: 'Completa la cuenta bancaria o deja los tres campos vacíos',
        });
      }
    }
  });
type ProviderForm = z.infer<typeof providerForm>;

/** Opciones activas más el valor actual aunque ya esté inactivo (se conserva, F03 CA-3). */
function options(
  items: CatalogItem[] | undefined,
  current: { id: string; label: string } | null,
  label: (item: CatalogItem) => string,
): SelectOption[] {
  const list = (items ?? []).map((item) => ({ value: item.id, label: label(item) }));
  if (current && !list.some((o) => o.value === current.id)) {
    list.push({ value: current.id, label: `${current.label} (inactivo)` });
  }
  return list;
}

export function ProviderFormDialog({
  provider,
  onClose,
  onSaved,
}: {
  provider: ServiceProvider | null;
  onClose: () => void;
  onSaved: (provider: ServiceProvider) => void | Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const documentTypes = useQuery({
    queryKey: queryKeys.catalog('document-types', false),
    queryFn: () => listCatalog('document-types'),
  });
  const banks = useQuery({
    queryKey: queryKeys.catalog('banks', false),
    queryFn: () => listCatalog('banks'),
  });
  const accountTypes = useQuery({
    queryKey: queryKeys.catalog('account-types', false),
    queryFn: () => listCatalog('account-types'),
  });

  const form = useForm<ProviderForm>({
    resolver: zodResolver(providerForm),
    defaultValues: {
      name: provider?.name ?? '',
      documentTypeId: provider?.documentType.id ?? '',
      documentNumber: provider?.documentNumber ?? '',
      description: provider?.description ?? '',
      bankId: provider?.bank?.id ?? '',
      accountTypeId: provider?.accountType?.id ?? '',
      accountNumber: provider?.accountNumber ?? '',
    },
  });
  const { errors } = form.formState;

  const save = useMutation({
    mutationFn: (values: ProviderForm) => {
      const body = {
        name: values.name,
        documentTypeId: values.documentTypeId,
        documentNumber: values.documentNumber,
        description: values.description === '' ? null : values.description,
        bankId: values.bankId === '' ? null : values.bankId,
        accountTypeId: values.accountTypeId === '' ? null : values.accountTypeId,
        accountNumber: values.accountNumber === '' ? null : values.accountNumber,
      };
      return provider ? updateProvider(provider.id, body) : createProvider(body);
    },
    onSuccess: async (saved) => {
      toast.success(provider ? 'Cambios guardados' : 'Prestador creado');
      await onSaved(saved);
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
      title={provider ? 'Editar prestador' : 'Nuevo prestador'}
      error={error}
      submitLabel="Guardar"
      isSubmitting={save.isPending}
      onSubmit={() =>
        void form.handleSubmit((values) => {
          save.mutate(values);
        })()
      }
    >
      <FormField label="Nombre" autoFocus error={errors.name?.message} {...form.register('name')} />
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Controller
          control={form.control}
          name="documentTypeId"
          render={({ field }) => (
            <SelectField
              label="Tipo de documento"
              placeholder="Elige"
              value={field.value}
              onChange={field.onChange}
              options={options(
                documentTypes.data,
                provider
                  ? { id: provider.documentType.id, label: provider.documentType.code }
                  : null,
                (d) => d.code ?? d.name,
              )}
              error={errors.documentTypeId?.message}
            />
          )}
        />
        <FormField
          label="Número de documento"
          error={errors.documentNumber?.message}
          {...form.register('documentNumber')}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="provider-description">Descripción (opcional)</Label>
        <Textarea id="provider-description" rows={2} {...form.register('description')} />
      </div>

      <fieldset className="grid gap-4 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">Cuenta bancaria (opcional)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="bankId"
            render={({ field }) => (
              <SelectField
                label="Banco"
                placeholder="Sin cuenta"
                noneLabel="Sin cuenta bancaria"
                value={field.value}
                onChange={field.onChange}
                options={options(
                  banks.data,
                  provider?.bank ? { id: provider.bank.id, label: provider.bank.name } : null,
                  (b) => b.name,
                )}
                error={errors.bankId?.message}
              />
            )}
          />
          <Controller
            control={form.control}
            name="accountTypeId"
            render={({ field }) => (
              <SelectField
                label="Tipo de cuenta"
                placeholder="Elige"
                noneLabel="—"
                value={field.value}
                onChange={field.onChange}
                options={options(
                  accountTypes.data,
                  provider?.accountType
                    ? { id: provider.accountType.id, label: provider.accountType.name }
                    : null,
                  (a) => a.name,
                )}
                error={errors.accountTypeId?.message}
              />
            )}
          />
        </div>
        <FormField
          label="Número de cuenta"
          inputMode="numeric"
          error={errors.accountNumber?.message}
          {...form.register('accountNumber')}
        />
      </fieldset>
    </FormDialog>
  );
}
