import { z } from 'zod';

const name = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Ingresa un nombre')
    .max(max, `Debe tener como máximo ${max} caracteres`);

// ── Catálogos globales (bancos, tipos de cuenta, tipos de documento) ─────────────────────

export const CATALOG_KINDS = ['banks', 'account-types', 'document-types'] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export const catalogItemSchema = z.object({
  id: z.uuid(),
  /** Solo en tipos de documento (CC, NIT, CE…). */
  code: z.string().nullable(),
  name: z.string(),
  isActive: z.boolean(),
});
export type CatalogItem = z.infer<typeof catalogItemSchema>;

const nameMaxByKind: Record<CatalogKind, number> = {
  banks: 60,
  'account-types': 30,
  'document-types': 40,
};

const documentCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,5}$/, 'Usa de 1 a 5 letras (p. ej. CC, NIT)');

export function createCatalogItemSchema(kind: CatalogKind) {
  return kind === 'document-types'
    ? z.object({ code: documentCode, name: name(nameMaxByKind[kind]) })
    : z.object({ name: name(nameMaxByKind[kind]) });
}

export function updateCatalogItemSchema(kind: CatalogKind) {
  const base = z.object({
    name: name(nameMaxByKind[kind]).optional(),
    isActive: z.boolean().optional(),
  });
  return kind === 'document-types' ? base.extend({ code: documentCode.optional() }) : base;
}

export type CreateCatalogItem = { name: string; code?: string };
export type UpdateCatalogItem = { name?: string; code?: string; isActive?: boolean };

// ── Categorías de egreso (por organización) ───────────────────────────────────────────────

export const expenseCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** `'FEES'` en "Honorarios": no se puede renombrar, desactivar ni borrar. */
  systemCode: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const createExpenseCategorySchema = z.object({ name: name(40) });
export type CreateExpenseCategory = z.infer<typeof createExpenseCategorySchema>;

export const updateExpenseCategorySchema = z
  .object({ name: name(40).optional(), isActive: z.boolean().optional() })
  .refine((v) => v.name !== undefined || v.isActive !== undefined, 'Nada que actualizar');
export type UpdateExpenseCategory = z.infer<typeof updateExpenseCategorySchema>;

export const reorderExpenseCategoriesSchema = z.object({ ids: z.array(z.uuid()).min(1) });
export type ReorderExpenseCategories = z.infer<typeof reorderExpenseCategoriesSchema>;
