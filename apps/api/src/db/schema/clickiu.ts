import { sql } from 'drizzle-orm';
import { check, date, index, numeric, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { auditColumns, id, organizationId } from '../columns';
import { organizations } from './core';
import { anderp } from './enums';

export const clickiuMovementType = anderp.enum('clickiu_movement_type', ['recharge', 'sale']);
export const clickiuSaleStatus = anderp.enum('clickiu_sale_status', ['credit', 'completed']);

/**
 * Recargas y ventas del saldo prepagado de Clic Kiu (F11, design.md §5.10). Que el tipo no
 * cambie y que el saldo no quede negativo lo exigen triggers de la migración 0021.
 */
export const clickiuMovements = anderp.table(
  'clickiu_movements',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    type: clickiuMovementType().notNull(),
    // Solo las ventas tienen estado: Crédito (el cliente debe) o Completado (ya pagó).
    status: clickiuSaleStatus(),
    movementDate: date({ mode: 'string' }).notNull(),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    description: varchar({ length: 500 }),
    ...auditColumns,
  },
  (t) => [
    unique('clickiu_movements_org_id_uq').on(t.organizationId, t.id),
    check('clickiu_movements_status_ck', sql`(${t.type} = 'sale') = (${t.status} is not null)`),
    check('clickiu_movements_amount_ck', sql`${t.amount} > 0`),
    index('clickiu_movements_org_date_idx')
      .on(t.organizationId, t.movementDate)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/** Saldo actual por organización: recargas − ventas, sin borrados (vista creada a mano). */
export const clickiuBalance = anderp
  .view('v_clickiu_balance', {
    organizationId: uuid().notNull(),
    balance: numeric({ precision: 14, scale: 2 }).notNull(),
  })
  .existing();
