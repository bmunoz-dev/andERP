import { sql } from 'drizzle-orm';
import { boolean, smallint, unique, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { auditColumns, id, organizationId } from '../columns';
import { organizations } from './core';
import { anderp } from './enums';

// ── Catálogos globales (design.md §5.4): los gestiona el super admin ──────────────────────

export const banks = anderp.table(
  'banks',
  {
    id: id(),
    name: varchar({ length: 60 }).notNull(),
    isActive: boolean().notNull().default(true),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex('banks_name_uq')
      .on(t.name)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const accountTypes = anderp.table(
  'account_types',
  {
    id: id(),
    name: varchar({ length: 30 }).notNull(),
    isActive: boolean().notNull().default(true),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex('account_types_name_uq')
      .on(t.name)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const documentTypes = anderp.table(
  'document_types',
  {
    id: id(),
    code: varchar({ length: 5 }).notNull(),
    name: varchar({ length: 40 }).notNull(),
    isActive: boolean().notNull().default(true),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex('document_types_code_uq')
      .on(t.code)
      .where(sql`${t.deletedAt} is null`),
  ],
);

// ── Catálogo por organización ─────────────────────────────────────────────────────────────

/**
 * Categorías de egreso (en la interfaz: "Departamento"). La de `system_code = 'FEES'` recibe
 * los pagos de honorarios y está protegida por un trigger (F02 CA-10).
 */
export const expenseCategories = anderp.table(
  'expense_categories',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    name: varchar({ length: 40 }).notNull(),
    systemCode: varchar({ length: 20 }),
    isActive: boolean().notNull().default(true),
    sortOrder: smallint().notNull(),
    ...auditColumns,
  },
  (t) => [
    unique('expense_categories_org_id_uq').on(t.organizationId, t.id),
    uniqueIndex('expense_categories_name_uq')
      .on(t.organizationId, t.name)
      .where(sql`${t.deletedAt} is null`),
    uniqueIndex('expense_categories_system_code_uq')
      .on(t.organizationId, t.systemCode)
      .where(sql`${t.deletedAt} is null`),
  ],
);
