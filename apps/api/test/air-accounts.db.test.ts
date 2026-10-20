import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, withOwnerSql, withRuntimeSql } from './setup/reset-db';

/** Reglas de F18 que viven en la base de datos: catálogo, cuentas, tiquetes y cupo (design.md §5.10). */
describe('F18 en la base de datos', () => {
  let org: string;
  let operator: string;

  type Movement = {
    account: string;
    type: 'opening_balance' | 'recharge' | 'payment' | 'refund' | 'issue';
    amount: string;
    ticket?: string;
    netFare?: string;
    taxes?: string;
  };

  /** Inserta un movimiento; las emisiones llevan sus campos de tiquete y `amount = neta + impuestos`. */
  async function move(sql: postgres.Sql, m: Movement) {
    const id = randomUUID();
    if (m.type === 'issue') {
      const netFare = m.netFare ?? m.amount;
      const taxes = m.taxes ?? '0.00';
      await sql`insert into air_account_movements (id, organization_id, account_id, type, movement_date,
          amount, pnr, ticket_number, passenger, net_fare, taxes, collection_status)
        values (${id}, ${org}, ${m.account}, 'issue', '2026-10-01', ${m.amount}, 'K4J2LL',
          ${m.ticket ?? randomTicket()}, 'Ana Pérez', ${netFare}, ${taxes}, 'pending')`;
    } else {
      await sql`insert into air_account_movements (id, organization_id, account_id, type, movement_date, amount)
        values (${id}, ${org}, ${m.account}, ${m.type}, '2026-10-01', ${m.amount})`;
    }
    return id;
  }

  const randomTicket = () => String(Math.floor(Math.random() * 1e13)).padStart(13, '0');

  async function account(sql: postgres.Sql, creditLimit = '0.00', name: string = randomUUID()) {
    const id = randomUUID();
    await sql`insert into air_accounts (id, organization_id, operator_id, name, credit_limit)
      values (${id}, ${org}, ${operator}, ${name}, ${creditLimit})`;
    return id;
  }

  const balances = async (sql: postgres.Sql, accountId: string) => {
    const [row] = await sql<{ balance: string; available: string }[]>`
      select balance, available from v_air_account_balances where account_id = ${accountId}`;
    return row!;
  };

  beforeEach(async () => {
    await resetDb();
    org = randomUUID();
    operator = randomUUID();
    await withRuntimeSql(async (sql) => {
      await sql`insert into organizations (id, name, tax_id) values (${org}, 'Org', ${org.slice(0, 20)})`;
      await sql`insert into air_operators (id, organization_id, name) values (${operator}, ${org}, 'Satena')`;
    });
  });

  it('CA-34 la migración que borra Clic Kiu se detiene si la tabla tiene filas', async () => {
    const dir = path.resolve(__dirname, '../drizzle');
    const file = readdirSync(dir).find((f) => f.startsWith('0030_'));
    const guard = readFileSync(path.join(dir, file!), 'utf8');
    await withOwnerSql(async (sql) => {
      await sql`create table anderp.clickiu_movements (id int)`;
      try {
        await sql`insert into anderp.clickiu_movements values (1)`;
        await expect(sql.unsafe(guard)).rejects.toThrow(/clickiu_movements is not empty/);
      } finally {
        await sql`drop table anderp.clickiu_movements`;
      }
    });
  });

  it('CA-1 y CA-3 los nombres son únicos sin distinguir mayúsculas y se liberan al borrar', async () => {
    await withRuntimeSql(async (sql) => {
      await expect(
        sql`insert into air_operators (id, organization_id, name) values (${randomUUID()}, ${org}, 'SATENA')`,
      ).rejects.toThrow(/air_operators_name_uq/);

      const first = await account(sql, '0.00', 'KIU Bogotá');
      await expect(account(sql, '0.00', 'kiu bogotá')).rejects.toThrow(/air_accounts_name_uq/);
      await sql`update air_accounts set deleted_at = now() where id = ${first}`;
      await account(sql, '0.00', 'KIU Bogotá');
    });
  });

  it('CA-3 el límite de crédito no es negativo', async () => {
    await withRuntimeSql(async (sql) => {
      await expect(account(sql, '-1.00')).rejects.toThrow(/air_accounts_credit_limit_ck/);
    });
  });

  it('CA-25 una cuenta no apunta a un operador de otra organización', async () => {
    const other = randomUUID();
    await withRuntimeSql(async (sql) => {
      await sql`insert into organizations (id, name, tax_id) values (${other}, 'Otra', ${other.slice(0, 20)})`;
      await expect(
        sql`insert into air_accounts (id, organization_id, operator_id, name)
          values (${randomUUID()}, ${other}, ${operator}, 'Ajena')`,
      ).rejects.toThrow(/air_accounts_operator_fk/);
    });
  });

  it('CA-7 el monto es positivo; el saldo inicial puede ser negativo pero no 0', async () => {
    await withRuntimeSql(async (sql) => {
      const acc = await account(sql, '100.00');
      for (const type of ['recharge', 'payment', 'refund'] as const) {
        await expect(move(sql, { account: acc, type, amount: '0.00' })).rejects.toThrow(
          /air_account_movements_amount_ck/,
        );
        await expect(move(sql, { account: acc, type, amount: '-5.00' })).rejects.toThrow(
          /air_account_movements_amount_ck/,
        );
      }
      await expect(
        move(sql, { account: acc, type: 'opening_balance', amount: '0.00' }),
      ).rejects.toThrow(/air_account_movements_amount_ck/);
      await move(sql, { account: acc, type: 'opening_balance', amount: '-50.00' });
    });
  });

  it('CA-8 una cuenta tiene un solo saldo inicial no borrado', async () => {
    await withRuntimeSql(async (sql) => {
      const acc = await account(sql);
      const first = await move(sql, { account: acc, type: 'opening_balance', amount: '10.00' });
      await expect(
        move(sql, { account: acc, type: 'opening_balance', amount: '5.00' }),
      ).rejects.toThrow(/air_account_movements_opening_uq/);
      await sql`update air_account_movements set deleted_at = now() where id = ${first}`;
      await move(sql, { account: acc, type: 'opening_balance', amount: '5.00' });
    });
  });

  it('CA-9 el monto de una emisión es tarifa neta + impuestos', async () => {
    await withRuntimeSql(async (sql) => {
      const acc = await account(sql, '1000.00');
      await move(sql, {
        account: acc,
        type: 'issue',
        amount: '150.00',
        netFare: '120.00',
        taxes: '30.00',
      });
      await expect(
        move(sql, {
          account: acc,
          type: 'issue',
          amount: '149.00',
          netFare: '120.00',
          taxes: '30.00',
        }),
      ).rejects.toThrow(/air_account_movements_amount_ck/);
    });
  });

  it('CA-9 y CA-10 los campos del tiquete van solo en emisiones y completos', async () => {
    await withRuntimeSql(async (sql) => {
      const acc = await account(sql, '1000.00');
      await expect(
        sql`insert into air_account_movements (id, organization_id, account_id, type, movement_date, amount, pnr)
          values (${randomUUID()}, ${org}, ${acc}, 'recharge', '2026-10-01', '10.00', 'K4J2LL')`,
      ).rejects.toThrow(/air_account_movements_ticket_ck/);
      await expect(
        sql`insert into air_account_movements (id, organization_id, account_id, type, movement_date, amount)
          values (${randomUUID()}, ${org}, ${acc}, 'issue', '2026-10-01', '10.00')`,
      ).rejects.toThrow(/air_account_movements_ticket_ck/);
    });
  });

  it('CA-9 el PNR y el número de tiquete tienen su formato', async () => {
    await withRuntimeSql(async (sql) => {
      const acc = await account(sql, '1000.00');
      const issue = await move(sql, { account: acc, type: 'issue', amount: '10.00' });
      await expect(
        sql`update air_account_movements set pnr = 'k4j2ll' where id = ${issue}`,
      ).rejects.toThrow(/air_account_movements_pnr_ck/);
      await expect(
        sql`update air_account_movements set ticket_number = '12345' where id = ${issue}`,
      ).rejects.toThrow(/air_account_movements_ticket_number_ck/);
    });
  });

  it('CA-11 el número de tiquete no se repite en la organización salvo si se borró', async () => {
    await withRuntimeSql(async (sql) => {
      const acc = await account(sql, '1000.00');
      const other = await account(sql, '1000.00');
      const first = await move(sql, {
        account: acc,
        type: 'issue',
        amount: '10.00',
        ticket: '1234567890123',
      });
      await expect(
        move(sql, { account: other, type: 'issue', amount: '10.00', ticket: '1234567890123' }),
      ).rejects.toThrow(/air_account_movements_ticket_number_uq/);
      await sql`update air_account_movements set deleted_at = now() where id = ${first}`;
      await move(sql, { account: other, type: 'issue', amount: '10.00', ticket: '1234567890123' });
    });
  });

  it('CA-12 el tipo y la cuenta no cambian después de crear el movimiento', async () => {
    await withRuntimeSql(async (sql) => {
      const acc = await account(sql);
      const other = await account(sql);
      const id = await move(sql, { account: acc, type: 'recharge', amount: '10.00' });
      await expect(
        sql`update air_account_movements set type = 'payment' where id = ${id}`,
      ).rejects.toThrow(/AIR_MOVEMENT_TYPE_IMMUTABLE/);
      await expect(
        sql`update air_account_movements set account_id = ${other} where id = ${id}`,
      ).rejects.toThrow(/AIR_MOVEMENT_ACCOUNT_IMMUTABLE/);
    });
  });

  it('CA-15 el saldo suma todo, resta emisiones, no cuenta borrados, y el disponible suma el límite', async () => {
    await withRuntimeSql(async (sql) => {
      const empty = await account(sql, '500.00');
      expect(await balances(sql, empty)).toEqual({ balance: '0.00', available: '500.00' });

      const acc = await account(sql, '1000.00');
      await move(sql, { account: acc, type: 'opening_balance', amount: '-200.00' });
      await move(sql, { account: acc, type: 'recharge', amount: '100.00' });
      await move(sql, { account: acc, type: 'payment', amount: '50.00' });
      await move(sql, { account: acc, type: 'refund', amount: '25.00' });
      await move(sql, { account: acc, type: 'issue', amount: '300.00' });
      const deleted = await move(sql, { account: acc, type: 'issue', amount: '100.00' });
      await sql`update air_account_movements set deleted_at = now() where id = ${deleted}`;
      expect(await balances(sql, acc)).toEqual({ balance: '-325.00', available: '675.00' });
    });
  });

  it('CA-16 prepago: rechaza dejar el saldo negativo y acepta llegar a 0', async () => {
    await withRuntimeSql(async (sql) => {
      const acc = await account(sql, '0.00');
      const recharge = await move(sql, { account: acc, type: 'recharge', amount: '1000.00' });
      await expect(move(sql, { account: acc, type: 'issue', amount: '1000.01' })).rejects.toThrow(
        /AIR_ACCOUNT_INSUFFICIENT_BALANCE/,
      );

      const issue = await move(sql, { account: acc, type: 'issue', amount: '600.00' });
      await expect(
        sql`update air_account_movements set amount = '1000.01', net_fare = '1000.01' where id = ${issue}`,
      ).rejects.toThrow(/AIR_ACCOUNT_INSUFFICIENT_BALANCE/);
      await expect(
        sql`update air_account_movements set amount = '599.99' where id = ${recharge}`,
      ).rejects.toThrow(/AIR_ACCOUNT_INSUFFICIENT_BALANCE/);
      await expect(
        sql`update air_account_movements set deleted_at = now() where id = ${recharge}`,
      ).rejects.toThrow(/AIR_ACCOUNT_INSUFFICIENT_BALANCE/);

      await move(sql, { account: acc, type: 'issue', amount: '400.00' });
      expect(await balances(sql, acc)).toEqual({ balance: '0.00', available: '0.00' });
    });
  });

  it('CA-16 crédito: rechaza pasarse del cupo, un saldo inicial que lo excede y bajar el límite bajo la deuda', async () => {
    await withRuntimeSql(async (sql) => {
      const acc = await account(sql, '50000000.00');
      await expect(
        move(sql, { account: acc, type: 'opening_balance', amount: '-50000000.01' }),
      ).rejects.toThrow(/AIR_ACCOUNT_CREDIT_LIMIT_EXCEEDED/);
      await move(sql, { account: acc, type: 'opening_balance', amount: '-12400000.00' });
      await expect(
        move(sql, { account: acc, type: 'issue', amount: '37600000.01' }),
      ).rejects.toThrow(/AIR_ACCOUNT_CREDIT_LIMIT_EXCEEDED/);

      await expect(
        sql`update air_accounts set credit_limit = '12399999.99' where id = ${acc}`,
      ).rejects.toThrow(/AIR_ACCOUNT_CREDIT_LIMIT_EXCEEDED/);
      await sql`update air_accounts set credit_limit = '12400000.00' where id = ${acc}`;
      expect(await balances(sql, acc)).toEqual({ balance: '-12400000.00', available: '0.00' });
    });
  });

  it('CA-17 la regla mira el saldo total, no fecha por fecha', async () => {
    await withRuntimeSql(async (sql) => {
      const acc = await account(sql);
      await sql`insert into air_account_movements (id, organization_id, account_id, type, movement_date, amount)
        values (${randomUUID()}, ${org}, ${acc}, 'recharge', '2026-10-20', '100.00')`;
      await sql`insert into air_account_movements (id, organization_id, account_id, type, movement_date,
          amount, pnr, ticket_number, passenger, net_fare, taxes, collection_status)
        values (${randomUUID()}, ${org}, ${acc}, 'issue', '2026-10-01', '100.00', 'K4J2LL',
          ${randomTicket()}, 'Ana', '100.00', '0.00', 'pending')`;
      expect((await balances(sql, acc)).balance).toBe('0.00');
    });
  });

  /** Dos transacciones que emiten antes de que cualquiera confirme. */
  async function issueTwiceConcurrently(first: string, second: string) {
    let arrive!: () => void;
    let inserted = 0;
    const bothInserted = new Promise<void>((resolve) => (arrive = resolve));
    const issue = (acc: string) =>
      withRuntimeSql((sql) =>
        sql.begin(async (tx) => {
          await move(tx as unknown as postgres.Sql, {
            account: acc,
            type: 'issue',
            amount: '600.00',
          });
          if (++inserted === 2) arrive();
          await bothInserted;
        }),
      );
    return Promise.allSettled([issue(first), issue(second)]);
  }

  it('CA-18 dos emisiones simultáneas en la misma cuenta que juntas exceden el cupo: solo una confirma', async () => {
    const acc = await withRuntimeSql(async (sql) => {
      const id = await account(sql);
      await move(sql, { account: id, type: 'recharge', amount: '1000.00' });
      return id;
    });

    const results = await issueTwiceConcurrently(acc, acc);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(rejected.reason)).toMatch(/AIR_ACCOUNT_INSUFFICIENT_BALANCE/);
    expect((await withRuntimeSql((sql) => balances(sql, acc))).balance).toBe('400.00');
  });

  it('CA-18 en cuentas distintas las dos emisiones confirman', async () => {
    const [a, b] = await withRuntimeSql(async (sql) => {
      const ids = [await account(sql), await account(sql)];
      for (const id of ids) await move(sql, { account: id, type: 'recharge', amount: '1000.00' });
      return ids;
    });

    const results = await issueTwiceConcurrently(a!, b!);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('la regla del cupo rechaza REPEATABLE READ (no vería las emisiones de otras transacciones)', async () => {
    const acc = await withRuntimeSql((sql) => account(sql));
    const inLevel = (level: string) =>
      withRuntimeSql((sql) =>
        sql.begin(async (tx) => {
          await tx.unsafe(`set transaction isolation level ${level}`);
          await move(tx as unknown as postgres.Sql, {
            account: acc,
            type: 'recharge',
            amount: '10.00',
          });
        }),
      );

    await expect(inLevel('repeatable read')).rejects.toThrow(/requires read committed/);
    await inLevel('serializable');
    expect((await withRuntimeSql((sql) => balances(sql, acc))).balance).toBe('10.00');
  });
});
