import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  numeric,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns, id, organizationId } from '../columns';
import { organizations } from './core';
import { anderp } from './enums';
import { providerContracts } from './service-providers';

const firstOfMonth = sql`make_date(period_year, period_month, 1)`;

/** Cabecera: un pago por contrato y semana del mes (formato B, design.md §5.5). */
export const feePayments = anderp.table(
  'fee_payments',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    contractId: uuid().notNull(),
    periodYear: smallint().notNull(),
    periodMonth: smallint().notNull(),
    weekOfMonth: smallint().notNull(),
    // Rango de la semana, calculado por la base de datos: S1–S3 de 7 días, S4 hasta fin de mes.
    periodStart: date({ mode: 'string' })
      .notNull()
      .generatedAlwaysAs(sql`${firstOfMonth} + (week_of_month - 1) * 7`),
    periodEnd: date({ mode: 'string' })
      .notNull()
      .generatedAlwaysAs(
        sql`case when week_of_month < 4
          then ${firstOfMonth} + (week_of_month - 1) * 7 + 6
          else (${firstOfMonth} + interval '1 month' - interval '1 day')::date end`,
      ),
    paymentDate: date({ mode: 'string' }).notNull(),
    notes: text(),
    ...auditColumns,
  },
  (t) => [
    unique('fee_payments_org_id_uq').on(t.organizationId, t.id),
    foreignKey({
      name: 'fee_payments_contract_fk',
      columns: [t.organizationId, t.contractId],
      foreignColumns: [providerContracts.organizationId, providerContracts.id],
    }),
    uniqueIndex('fee_payments_period_uq')
      .on(t.contractId, t.periodYear, t.periodMonth, t.weekOfMonth)
      .where(sql`${t.deletedAt} is null`),
    check('fee_payments_year_ck', sql`${t.periodYear} between 2000 and 2100`),
    check('fee_payments_month_ck', sql`${t.periodMonth} between 1 and 12`),
    check('fee_payments_week_ck', sql`${t.weekOfMonth} between 1 and 4`),
  ],
);

/** Detalle: una fila por fecha trabajada. Sigue a su cabecera (sin borrado lógico propio). */
export const feePaymentDays = anderp.table(
  'fee_payment_days',
  {
    id: id(),
    organizationId: organizationId(),
    feePaymentId: uuid().notNull(),
    workDate: date({ mode: 'string' }).notNull(),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    isHoliday: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'fee_payment_days_payment_fk',
      columns: [t.organizationId, t.feePaymentId],
      foreignColumns: [feePayments.organizationId, feePayments.id],
    }).onDelete('cascade'),
    unique('fee_payment_days_date_uq').on(t.feePaymentId, t.workDate),
    check('fee_payment_days_amount_ck', sql`${t.amount} >= 0`),
  ],
);

// Vistas creadas a mano en la migración `fee_payment_views` (drizzle-kit no las gestiona).
export const feePaymentTotals = anderp
  .view('v_fee_payment_totals', {
    feePaymentId: uuid().notNull(),
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    totalAmount: numeric({ precision: 14, scale: 2 }).notNull(),
  })
  .existing();

/** F10: lo pagado por contrato y mes trabajado (migración `monthly_contract_amount`). */
export const contractMonthTotals = anderp
  .view('v_contract_month_totals', {
    organizationId: uuid().notNull(),
    contractId: uuid().notNull(),
    periodYear: smallint().notNull(),
    periodMonth: smallint().notNull(),
    paidAmount: numeric({ precision: 14, scale: 2 }).notNull(),
  })
  .existing();
