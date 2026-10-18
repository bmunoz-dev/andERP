import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDb, withRuntimeSql } from './setup/reset-db';

/** Reglas de F16 que viven en la base de datos: forma de pago del contrato y pagos de monto fijo. */
describe('F16 en la base de datos', () => {
  let org: string;
  let docType: string;

  /** Contrato de 2026-03-01 a 2026-05-31 (o sin fin). */
  async function contract(
    sql: postgres.Sql,
    mode: 'daily' | 'fixed',
    end: string | null = '2026-05-31',
  ) {
    const id = randomUUID();
    const provider = randomUUID();
    await sql`insert into service_providers (id, organization_id, name, document_type_id, document_number)
      values (${provider}, ${org}, 'Ana', ${docType}, ${provider.slice(0, 12)})`;
    await sql`insert into provider_contracts
      (id, organization_id, service_provider_id, start_date, end_date, work_agreement, payment_frequency, monthly_amount, payment_mode)
      values (${id}, ${org}, ${provider}, '2026-03-01', ${end}, 'x', 'monthly', '1000.00', ${mode})`;
    return id;
  }

  async function fixed(
    sql: postgres.Sql,
    contractId: string,
    [year, month]: [number, number],
    amount = '100.00',
  ) {
    const id = randomUUID();
    await sql`insert into fixed_payments (id, organization_id, contract_id, period_year, period_month, payment_date, amount)
      values (${id}, ${org}, ${contractId}, ${year}, ${month}, '2026-04-15', ${amount})`;
    return id;
  }

  async function daily(sql: postgres.Sql, contractId: string) {
    const id = randomUUID();
    await sql`insert into fee_payments (id, organization_id, contract_id, period_year, period_month, week_of_month, payment_date)
      values (${id}, ${org}, ${contractId}, 2026, 4, 1, '2026-04-07')`;
    await sql`insert into fee_payment_days (id, organization_id, fee_payment_id, work_date, amount)
      values (${randomUUID()}, ${org}, ${id}, '2026-04-02', '50.00')`;
    return id;
  }

  beforeAll(async () => {
    await resetDb();
    await withRuntimeSql(async (sql) => {
      [org, docType] = [randomUUID(), randomUUID()];
      await sql`insert into organizations (id, name, tax_id) values (${org}, 'Org', ${org.slice(0, 20)})`;
      await sql`insert into document_types (id, code, name) values (${docType}, 'CC', 'Cédula')`;
    });
  });

  it('CA-1 los contratos son por días si no se indica otra cosa', async () => {
    await withRuntimeSql(async (sql) => {
      const provider = randomUUID();
      await sql`insert into service_providers (id, organization_id, name, document_type_id, document_number)
        values (${provider}, ${org}, 'Ana', ${docType}, ${provider.slice(0, 12)})`;
      const [c] = await sql<{ payment_mode: string }[]>`insert into provider_contracts
        (id, organization_id, service_provider_id, start_date, work_agreement, payment_frequency, monthly_amount)
        values (${randomUUID()}, ${org}, ${provider}, '2026-01-01', 'x', 'weekly', '1.00') returning payment_mode`;
      expect(c?.payment_mode).toBe('daily');
    });
  });

  it('CA-5 y CA-12 cada contrato solo acepta pagos de su forma de pago', async () => {
    await withRuntimeSql(async (sql) => {
      await expect(fixed(sql, await contract(sql, 'daily'), [2026, 4])).rejects.toThrow(
        'CONTRACT_PAYMENT_MODE_MISMATCH',
      );
      await expect(daily(sql, await contract(sql, 'fixed'))).rejects.toThrow(
        'CONTRACT_PAYMENT_MODE_MISMATCH',
      );
    });
  });

  it('CA-6 y CA-7 el mes trabajado se cruza con el contrato; varios pagos por mes', async () => {
    await withRuntimeSql(async (sql) => {
      const c = await contract(sql, 'fixed');
      await fixed(sql, c, [2026, 3]);
      await fixed(sql, c, [2026, 5]);
      await fixed(sql, c, [2026, 5]);
      await expect(fixed(sql, c, [2026, 2])).rejects.toThrow('FIXED_PAYMENT_OUTSIDE_CONTRACT');
      await expect(fixed(sql, c, [2026, 6])).rejects.toThrow('FIXED_PAYMENT_OUTSIDE_CONTRACT');
      await fixed(sql, await contract(sql, 'fixed', null), [2030, 1]);
    });
  });

  it('CA-4 el valor es mayor que 0', async () => {
    await withRuntimeSql(async (sql) => {
      await expect(fixed(sql, await contract(sql, 'fixed'), [2026, 4], '0.00')).rejects.toThrow(
        /fixed_payments_amount_ck/,
      );
    });
  });

  it('CA-9 el contrato y el mes trabajado no cambian; la fecha, el valor y las notas sí', async () => {
    await withRuntimeSql(async (sql) => {
      const p = await fixed(sql, await contract(sql, 'fixed'), [2026, 4]);
      await sql`update fixed_payments set payment_date = '2026-05-01', amount = '200.00', notes = 'n' where id = ${p}`;
      await expect(sql`update fixed_payments set period_month = 5 where id = ${p}`).rejects.toThrow(
        'FIXED_PAYMENT_PERIOD_IMMUTABLE',
      );
      const other = await contract(sql, 'fixed');
      await expect(
        sql`update fixed_payments set contract_id = ${other} where id = ${p}`,
      ).rejects.toThrow('FIXED_PAYMENT_PERIOD_IMMUTABLE');
    });
  });

  it('CA-3 la forma de pago no cambia si el contrato tiene pagos vivos', async () => {
    await withRuntimeSql(async (sql) => {
      const empty = await contract(sql, 'daily');
      await sql`update provider_contracts set payment_mode = 'fixed' where id = ${empty}`;

      const withDaily = await contract(sql, 'daily');
      await daily(sql, withDaily);
      await expect(
        sql`update provider_contracts set payment_mode = 'fixed' where id = ${withDaily}`,
      ).rejects.toThrow('CONTRACT_PAYMENT_MODE_LOCKED');

      const withFixed = await contract(sql, 'fixed');
      const p = await fixed(sql, withFixed, [2026, 4]);
      await expect(
        sql`update provider_contracts set payment_mode = 'daily' where id = ${withFixed}`,
      ).rejects.toThrow('CONTRACT_PAYMENT_MODE_LOCKED');
      await sql`update fixed_payments set deleted_at = now() where id = ${p}`;
      await sql`update provider_contracts set payment_mode = 'daily' where id = ${withFixed}`;
    });
  });

  it('CA-13 y CA-14 un contrato con pagos fijos no se borra ni deja meses pagados fuera', async () => {
    await withRuntimeSql(async (sql) => {
      const c = await contract(sql, 'fixed');
      await fixed(sql, c, [2026, 5]);
      await expect(
        sql`update provider_contracts set deleted_at = now() where id = ${c}`,
      ).rejects.toThrow('CONTRACT_HAS_PAYMENTS');
      await expect(
        sql`update provider_contracts set end_date = '2026-04-30' where id = ${c}`,
      ).rejects.toThrow('CONTRACT_DATES_EXCLUDE_PAYMENTS');
      // Mayo sigue cruzándose con un contrato que termina el 2026-05-01.
      await sql`update provider_contracts set end_date = '2026-05-01' where id = ${c}`;
    });
  });
});
