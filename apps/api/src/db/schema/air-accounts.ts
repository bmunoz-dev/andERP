import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns, id, organizationId } from '../columns';
import { organizations } from './core';
import { anderp } from './enums';

export const airMovementType = anderp.enum('air_movement_type', [
  'opening_balance',
  'recharge',
  'payment',
  'refund',
  'issue',
]);
export const airCollectionStatus = anderp.enum('air_collection_status', ['pending', 'collected']);

/** Operadores aéreos (aerolíneas o consolidadores): catálogo de la organización (F18, design.md §5.10). */
export const airOperators = anderp.table(
  'air_operators',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    name: varchar({ length: 120 }).notNull(),
    isActive: boolean().notNull().default(true),
    ...auditColumns,
  },
  (t) => [
    unique('air_operators_org_id_uq').on(t.organizationId, t.id),
    uniqueIndex('air_operators_name_uq')
      .on(t.organizationId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/** Cuenta con un operador. `credit_limit = 0` es prepago; el saldo nunca baja de `−credit_limit`. */
export const airAccounts = anderp.table(
  'air_accounts',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    operatorId: uuid().notNull(),
    name: varchar({ length: 120 }).notNull(),
    creditLimit: numeric({ precision: 14, scale: 2 }).notNull().default('0'),
    isActive: boolean().notNull().default(true),
    ...auditColumns,
  },
  (t) => [
    unique('air_accounts_org_id_uq').on(t.organizationId, t.id),
    foreignKey({
      name: 'air_accounts_operator_fk',
      columns: [t.organizationId, t.operatorId],
      foreignColumns: [airOperators.organizationId, airOperators.id],
    }),
    check('air_accounts_credit_limit_ck', sql`${t.creditLimit} >= 0`),
    uniqueIndex('air_accounts_name_uq')
      .on(t.organizationId, t.operatorId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/**
 * Libro de cada cuenta. Las emisiones llevan los datos del tiquete y restan; el resto suma.
 * El tipo y la cuenta no cambian, y el cupo se valida al confirmar (triggers de la migración 0032).
 */
export const airAccountMovements = anderp.table(
  'air_account_movements',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    accountId: uuid().notNull(),
    type: airMovementType().notNull(),
    movementDate: date({ mode: 'string' }).notNull(),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    description: varchar({ length: 500 }),
    pnr: varchar({ length: 6 }),
    ticketNumber: varchar({ length: 13 }),
    passenger: varchar({ length: 120 }),
    netFare: numeric({ precision: 14, scale: 2 }),
    taxes: numeric({ precision: 14, scale: 2 }),
    collectionStatus: airCollectionStatus(),
    ...auditColumns,
  },
  (t) => [
    unique('air_account_movements_org_id_uq').on(t.organizationId, t.id),
    foreignKey({
      name: 'air_account_movements_account_fk',
      columns: [t.organizationId, t.accountId],
      foreignColumns: [airAccounts.organizationId, airAccounts.id],
    }),
    // Las seis columnas del tiquete, todas en una emisión y ninguna en otro tipo.
    check(
      'air_account_movements_ticket_ck',
      sql`num_nonnulls(${t.pnr}, ${t.ticketNumber}, ${t.passenger}, ${t.netFare}, ${t.taxes}, ${t.collectionStatus})
        = case when ${t.type} = 'issue' then 6 else 0 end`,
    ),
    check(
      'air_account_movements_amount_ck',
      sql`${t.amount} <> 0
        and (${t.type} = 'opening_balance' or ${t.amount} > 0)
        and (${t.type} <> 'issue' or ${t.amount} = ${t.netFare} + ${t.taxes})`,
    ),
    check('air_account_movements_fare_ck', sql`${t.netFare} >= 0 and ${t.taxes} >= 0`),
    check('air_account_movements_pnr_ck', sql`${t.pnr} ~ '^[A-Z0-9]{6}$'`),
    check('air_account_movements_ticket_number_ck', sql`${t.ticketNumber} ~ '^[0-9]{13}$'`),
    uniqueIndex('air_account_movements_ticket_number_uq')
      .on(t.organizationId, t.ticketNumber)
      .where(sql`${t.deletedAt} is null`),
    uniqueIndex('air_account_movements_opening_uq')
      .on(t.accountId)
      .where(sql`${t.type} = 'opening_balance' and ${t.deletedAt} is null`),
    index('air_account_movements_account_date_idx')
      .on(t.organizationId, t.accountId, t.movementDate)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/** Saldo y disponible por cuenta, sin borrados (vista creada a mano en la migración 0032). */
export const airAccountBalances = anderp
  .view('v_air_account_balances', {
    organizationId: uuid().notNull(),
    accountId: uuid().notNull(),
    balance: numeric({ precision: 14, scale: 2 }).notNull(),
    available: numeric({ precision: 14, scale: 2 }).notNull(),
  })
  .existing();
