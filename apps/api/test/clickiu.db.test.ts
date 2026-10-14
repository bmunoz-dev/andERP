import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, withRuntimeSql } from './setup/reset-db';

/** Reglas de F11 que viven en la base de datos: estado de las ventas, tipo fijo y saldo ≥ 0. */
describe('F11 en la base de datos', () => {
  let org: string;

  type Movement = {
    type: 'recharge' | 'sale';
    amount: string;
    status?: 'credit' | 'completed' | null;
  };

  async function insert(sql: postgres.Sql, m: Movement) {
    const id = randomUUID();
    const status = m.status === undefined ? (m.type === 'sale' ? 'credit' : null) : m.status;
    await sql`insert into clickiu_movements (id, organization_id, type, status, movement_date, amount)
      values (${id}, ${org}, ${m.type}, ${status}, '2026-10-01', ${m.amount})`;
    return id;
  }

  const balance = async (sql: postgres.Sql) => {
    const [row] = await sql<{ balance: string }[]>`
      select balance from v_clickiu_balance where organization_id = ${org}`;
    return row?.balance;
  };

  beforeEach(async () => {
    await resetDb();
    org = randomUUID();
    await withRuntimeSql(
      (sql) =>
        sql`insert into organizations (id, name, tax_id) values (${org}, 'Org', ${org.slice(0, 20)})`,
    );
  });

  it('CA-2 una venta exige estado y una recarga no lo admite', async () => {
    await withRuntimeSql(async (sql) => {
      await insert(sql, { type: 'recharge', amount: '100.00' });
      await expect(insert(sql, { type: 'sale', amount: '10.00', status: null })).rejects.toThrow(
        /clickiu_movements_status_ck/,
      );
      await expect(
        insert(sql, { type: 'recharge', amount: '10.00', status: 'completed' }),
      ).rejects.toThrow(/clickiu_movements_status_ck/);
    });
  });

  it('CA-1 el monto es mayor que 0', async () => {
    await withRuntimeSql(async (sql) => {
      await expect(insert(sql, { type: 'recharge', amount: '0.00' })).rejects.toThrow(
        /clickiu_movements_amount_ck/,
      );
    });
  });

  it('CA-3 el tipo no cambia después de crear el movimiento', async () => {
    await withRuntimeSql(async (sql) => {
      const id = await insert(sql, { type: 'recharge', amount: '100.00' });
      await expect(
        sql`update clickiu_movements set type = 'sale', status = 'credit' where id = ${id}`,
      ).rejects.toThrow(/CLICKIU_MOVEMENT_TYPE_IMMUTABLE/);
    });
  });

  it('CA-5 y CA-6 el saldo es recargas menos ventas (en cualquier estado) y no cuenta borrados', async () => {
    await withRuntimeSql(async (sql) => {
      await insert(sql, { type: 'recharge', amount: '1000.00' });
      await insert(sql, { type: 'recharge', amount: '500.00' });
      await insert(sql, { type: 'sale', amount: '300.00', status: 'credit' });
      await insert(sql, { type: 'sale', amount: '200.00', status: 'completed' });
      const deleted = await insert(sql, { type: 'sale', amount: '100.00' });
      await sql`update clickiu_movements set deleted_at = now() where id = ${deleted}`;
      expect(await balance(sql)).toBe('1000.00');
    });
  });

  it('CA-7 rechaza todo lo que deja el saldo negativo y acepta llegar a 0', async () => {
    await withRuntimeSql(async (sql) => {
      const recharge = await insert(sql, { type: 'recharge', amount: '1000.00' });
      await expect(insert(sql, { type: 'sale', amount: '1000.01' })).rejects.toThrow(
        /CLICKIU_INSUFFICIENT_BALANCE/,
      );

      const sale = await insert(sql, { type: 'sale', amount: '600.00' });
      await expect(
        sql`update clickiu_movements set amount = '1000.01' where id = ${sale}`,
      ).rejects.toThrow(/CLICKIU_INSUFFICIENT_BALANCE/);
      await expect(
        sql`update clickiu_movements set amount = '599.99' where id = ${recharge}`,
      ).rejects.toThrow(/CLICKIU_INSUFFICIENT_BALANCE/);
      await expect(
        sql`update clickiu_movements set deleted_at = now() where id = ${recharge}`,
      ).rejects.toThrow(/CLICKIU_INSUFFICIENT_BALANCE/);

      await insert(sql, { type: 'sale', amount: '400.00' });
      expect(await balance(sql)).toBe('0.00');
    });
  });

  it('CA-9 dos ventas simultáneas que juntas superan el saldo: solo una confirma', async () => {
    await withRuntimeSql((sql) => insert(sql, { type: 'recharge', amount: '1000.00' }));

    // Las dos transacciones insertan antes de que cualquiera confirme.
    let arrive!: () => void;
    let inserted = 0;
    const bothInserted = new Promise<void>((resolve) => (arrive = resolve));
    const sell = () =>
      withRuntimeSql((sql) =>
        sql.begin(async (tx) => {
          await insert(tx as unknown as postgres.Sql, { type: 'sale', amount: '600.00' });
          if (++inserted === 2) arrive();
          await bothInserted;
        }),
      );

    const results = await Promise.allSettled([sell(), sell()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(rejected.reason)).toMatch(/CLICKIU_INSUFFICIENT_BALANCE/);
    expect(await withRuntimeSql(balance)).toBe('400.00');
  });
});
