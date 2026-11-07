import {
  ACCOUNT_NUMBER_PATTERN,
  documentNumberSchema,
  isBankAccountComplete,
} from '@anderp/shared';
import { z } from 'zod';

const BANK_FIELDS = ['bankId', 'accountTypeId', 'accountNumber'] as const;

/** Las reglas de la cuenta vienen de shared: las mismas que aplica la API (F24 CA-4). */
export const providerForm = z
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
      .refine((v) => v === '' || ACCOUNT_NUMBER_PATTERN.test(v), 'Usa de 4 a 30 números o guiones'),
  })
  .superRefine((values, ctx) => {
    // La cuenta va completa o no va (F03 CA-1): se marca el campo que falta.
    if (!isBankAccountComplete(values)) {
      for (const field of BANK_FIELDS.filter((f) => values[f] === '')) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: 'Completa la cuenta bancaria o deja los tres campos vacíos',
        });
      }
    }
  });
export type ProviderForm = z.infer<typeof providerForm>;
