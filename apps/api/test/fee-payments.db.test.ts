import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDb, withRuntimeSql } from './setup/reset-db';

/** Reglas de F04 que viven en la base de datos (constitución, principio III). */
describe('fee_payments en la base de datos', () => {
  let org: string;
  let docType: string;

  // Un prestador por contrato: la restricción EXCLUDE de F03 impide fechas cruzadas en uno mismo.
  async function contract(sql: postgres.Sql, start = '2026-01-01', end: string | null = null) {
    const id = randomUUID();
    const provider = randomUUID();
    await sql`insert into service_providers (id, organization_id, name, document_type_id, document_number)
      values (${provider}, ${org}, 'Ana', ${docType}, ${provider.slice(0, 12)})`;
    await sql`insert into provider_contracts
      (id, organization_id, service_provider_id, start_date, end_date, work_agreement, payment_frequency, monthly_amount)
      values (${id}, ${org}, ${provider}, ${start}, ${end}, 'x', 'weekly', '1000.00')`;
    return id;
  }

  async function payment(
    sql: postgres.Sql,
    contractId: string,
    year: number,
    month: number,
    week: number,
  ) {
    const [row] = await sql<{ id: string; period_start: string; period_end: string }[]>`
      insert into fee_payments (id, organization_id, contract_id, period_year, period_month, week_of_month, payment_date)
      values (${randomUUID()}, ${org}, ${contractId}, ${year}, ${month}, ${week}, '2026-12-31')
      returning id, period_start::text, period_end::text`;
    return row!;
  }

  function day(sql: postgres.Sql, paymentId: string, workDate: string, amount = '100.00') {
    return sql`insert into fee_payment_days (id, organization_id, fee_payment_id, work_date, amount)
      values (${randomUUID()}, ${org}, ${paymentId}, ${workDate}, ${amount})`;
  }

  beforeAll(async () => {
    await resetDb();
    await withRuntimeSql(async (sql) => {
      org = randomUUID();
      docType = randomUUID();
      await sql`insert into organizations (id, name, tax_id) values (${org}, 'Org', ${org.slice(0, 20)})`;
      await sql`insert into document_types (id, code, name) values (${docType}, 'CC', 'Cédula')`;
    });
  });

  it.each([
    [2026, 8, 4, '2026-08-22', '2026-08-31'],
    [2026, 2, 4, '2026-02-22', '2026-02-28'],
    [2028, 2, 4, '2028-02-22', '2028-02-29'],
    [2026, 9, 2, '2026-09-08', '2026-09-14'],
    [2026, 9, 4, '2026-09-22', '2026-09-30'],
  ])(
    'CA-2 %i-%i semana %i → %s … %s (columnas generadas)',
    async (year, month, week, start, end) => {
      await withRuntimeSql(async (sql) => {
        const row = await payment(sql, await contract(sql), year, month, week);
        expect([row.period_start, row.period_end]).toEqual([start, end]);
      });
    },
  );

  it('CA-5 no se paga dos veces la misma semana del mismo contrato', async () => {
    await withRuntimeSql(async (sql) => {
      const c = await contract(sql);
      await payment(sql, c, 2026, 3, 1);
      await expect(payment(sql, c, 2026, 3, 1)).rejects.toThrow(/fee_payments_period_uq/);
    });
  });

  it('CA-4 un día fuera de la semana o del contrato se rechaza (trigger)', async () => {
    await withRuntimeSql(async (sql) => {
      const p = await payment(sql, await contract(sql, '2026-04-03', '2026-04-30'), 2026, 4, 1);
      await day(sql, p.id, '2026-04-03');
      await expect(day(sql, p.id, '2026-04-08')).rejects.toThrow('WORK_DATE_OUTSIDE_WEEK');
      await expect(day(sql, p.id, '2026-04-02')).rejects.toThrow('WORK_DATE_OUTSIDE_CONTRACT');
      await expect(day(sql, p.id, '2026-04-03')).rejects.toThrow(/fee_payment_days_date_uq/);
      await expect(day(sql, p.id, '2026-04-04', '-1.00')).rejects.toThrow(
        /fee_payment_days_amount_ck/,
      );
    });
  });

  it('CA-11 el contrato y el periodo de un pago no cambian (trigger)', async () => {
    await withRuntimeSql(async (sql) => {
      const p = await payment(sql, await contract(sql), 2026, 5, 1);
      await expect(
        sql`update fee_payments set week_of_month = 2 where id = ${p.id}`,
      ).rejects.toThrow('FEE_PAYMENT_PERIOD_IMMUTABLE');
      await expect(
        sql`update fee_payments set contract_id = ${await contract(sql, '2027-01-01')} where id = ${p.id}`,
      ).rejects.toThrow('FEE_PAYMENT_PERIOD_IMMUTABLE');
      await sql`update fee_payments set payment_date = '2026-05-08', notes = 'ok' where id = ${p.id}`;
    });
  });

  it('CA-14 y CA-15 un contrato con pagos no se borra ni deja días fuera de sus fechas', async () => {
    await withRuntimeSql(async (sql) => {
      const c = await contract(sql, '2026-06-01', '2026-06-30');
      const p = await payment(sql, c, 2026, 6, 2);
      await day(sql, p.id, '2026-06-10');

      await expect(
        sql`update provider_contracts set deleted_at = now() where id = ${c}`,
      ).rejects.toThrow('CONTRACT_HAS_PAYMENTS');
      await expect(
        sql`update provider_contracts set end_date = '2026-06-09' where id = ${c}`,
      ).rejects.toThrow('CONTRACT_DATES_EXCLUDE_PAYMENTS');
      await expect(
        sql`update provider_contracts set start_date = '2026-06-11' where id = ${c}`,
      ).rejects.toThrow('CONTRACT_DATES_EXCLUDE_PAYMENTS');
      await sql`update provider_contracts set end_date = '2026-06-15', monthly_amount = '2000.00' where id = ${c}`;

      // Con el pago borrado, el contrato ya se puede borrar.
      await sql`update fee_payments set deleted_at = now() where id = ${p.id}`;
      await sql`update provider_contracts set deleted_at = now() where id = ${c}`;
    });
  });

  // F10 reemplazó el saldo y el tope del contrato (CA-9 y CA-10 de F04): ver monthly-amount.db.test.ts.
  it('v_fee_payment_totals suma los días de cada pago', async () => {
    await withRuntimeSql(async (sql) => {
      const c = await contract(sql, '2026-07-01', null);
      const p1 = await payment(sql, c, 2026, 7, 1);
      await day(sql, p1.id, '2026-07-01', '400.00');
      await day(sql, p1.id, '2026-07-02', '350.50');
      const [total] = await sql<{ total_amount: string }[]>`
        select total_amount::text from v_fee_payment_totals where fee_payment_id = ${p1.id}`;
      expect(total?.total_amount).toBe('750.50');
    });
  });
});
