import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  numeric,
  smallint,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns, id, organizationId } from '../columns';
import { expenseCategories } from './catalogs';
import { organizations } from './core';
import { anderp } from './enums';

/** Egresos manuales (design.md §5.6). Los pagos de honorarios se suman en la vista del libro. */
export const expenses = anderp.table(
  'expenses',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    categoryId: uuid().notNull(),
    concept: text().notNull(),
    invoiceNumber: varchar({ length: 40 }),
    paymentDate: date({ mode: 'string' }).notNull(),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    // La semana sale de la fecha (formato B): nunca se guarda a mano (decisión 5).
    weekOfMonth: smallint()
      .notNull()
      .generatedAlwaysAs(sql`anderp.week_of_month(payment_date)`),
    ...auditColumns,
  },
  (t) => [
    foreignKey({
      name: 'expenses_category_fk',
      columns: [t.organizationId, t.categoryId],
      foreignColumns: [expenseCategories.organizationId, expenseCategories.id],
    }),
    check('expenses_amount_ck', sql`${t.amount} > 0`),
    index('expenses_org_date_idx')
      .on(t.organizationId, t.paymentDate)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/** Libro unificado: egresos manuales + pagos de honorarios (vista creada a mano). */
export const expenseLedger = anderp
  .view('v_expense_ledger', {
    organizationId: uuid().notNull(),
    source: text().$type<'manual' | 'fee_payment'>().notNull(),
    sourceId: uuid().notNull(),
    categoryId: uuid().notNull(),
    concept: text().notNull(),
    invoiceNumber: varchar({ length: 40 }),
    paymentDate: date({ mode: 'string' }).notNull(),
    weekOfMonth: smallint().notNull(),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
  })
  .existing();
