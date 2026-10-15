import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns, id, organizationId } from '../columns';
import { organizations, users } from './core';
import { anderp } from './enums';

export const obligationFrequency = anderp.enum('obligation_frequency', [
  'once',
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'annual',
]);

/**
 * Obligaciones de pago con entidades (F13, design.md §5.11). Solo la regla y sus fechas límite:
 * el pago no se registra. La periodicidad solo sugiere la fecha siguiente.
 */
export const paymentObligations = anderp.table(
  'payment_obligations',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    entityName: varchar({ length: 100 }).notNull(),
    concept: varchar({ length: 150 }).notNull(),
    frequency: obligationFrequency().notNull(),
    noticeDays: smallint().notNull().default(15),
    notes: text(),
    ...auditColumns,
  },
  (t) => [
    unique('payment_obligations_org_id_uq').on(t.organizationId, t.id),
    check('payment_obligations_notice_days_ck', sql`${t.noticeDays} between 0 and 365`),
    uniqueIndex('payment_obligations_name_uq')
      .on(t.organizationId, sql`lower(${t.entityName})`, sql`lower(${t.concept})`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/**
 * Vencimientos de una obligación. Uno solo pendiente a la vez (índice único); uno completado no
 * cambia de fecha ni de obligación (trigger de la migración 0025).
 */
export const obligationDueDates = anderp.table(
  'obligation_due_dates',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    obligationId: uuid().notNull(),
    dueDate: date({ mode: 'string' }).notNull(),
    completedAt: timestamp({ withTimezone: true, mode: 'date' }),
    completedBy: uuid().references(() => users.id),
    ...auditColumns,
  },
  (t) => [
    unique('obligation_due_dates_org_id_uq').on(t.organizationId, t.id),
    foreignKey({
      name: 'obligation_due_dates_obligation_fk',
      columns: [t.organizationId, t.obligationId],
      foreignColumns: [paymentObligations.organizationId, paymentObligations.id],
    }),
    check(
      'obligation_due_dates_completed_ck',
      sql`(${t.completedAt} is null) = (${t.completedBy} is null)`,
    ),
    uniqueIndex('obligation_due_dates_pending_uq')
      .on(t.obligationId)
      .where(sql`${t.completedAt} is null and ${t.deletedAt} is null`),
    uniqueIndex('obligation_due_dates_date_uq')
      .on(t.obligationId, t.dueDate)
      .where(sql`${t.deletedAt} is null`),
  ],
);
