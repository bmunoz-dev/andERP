import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDb, withRuntimeSql } from './setup/reset-db';

/** Reglas de F10 que viven en la base de datos: monto mensual de referencia, sin tope. */
describe('F10 en la base de datos', () => {
  let org: string;
  let docType: string;

  async function contract(sql: postgres.Sql, monthlyAmount = '1000.00') {
    const id = randomUUID();
    const provider = randomUUID();
    await sql`insert into service_providers (id, organization_id, name, document_type_id, document_number)
      values (${provider}, ${org}, 'Ana', ${docType}, ${provider.slice(0, 12)})`;
    await sql`insert into provider_contracts
      (id, organization_id, service_provider_id, start_date, work_agreement, payment_frequency, monthly_amount)
      values (${id}, ${org}, ${provider}, '2026-01-01', 'x', 'weekly', ${monthlyAmount})`;
    return id;
  }

  /** Pago de una semana con un día trabajado; la fecha de pago puede caer en otro mes. */
  async function payment(
    sql: postgres.Sql,
    contractId: string,
    [year, month, week]: [number, number, number],
    workDate: string,
    amount: string,
    paymentDate = workDate,
  ) {
    const id = randomUUID();
    await sql`insert into fee_payments (id, organization_id, contract_id, period_year, period_month, week_of_month, payment_date)
      values (${id}, ${org}, ${contractId}, ${year}, ${month}, ${week}, ${paymentDate})`;
    await sql`insert into fee_payment_days (id, organization_id, fee_payment_id, work_date, amount)
      values (${randomUUID()}, ${org}, ${id}, ${workDate}, ${amount})`;
    return id;
  }

  const monthTotals = (sql: postgres.Sql, contractId: string) =>
    sql<{ period_year: number; period_month: number; paid_amount: string }[]>`
      select period_year, period_month, paid_amount from v_contract_month_totals
       where contract_id = ${contractId} order by period_year, period_month`;

  beforeAll(async () => {
    await resetDb();
    await withRuntimeSql(async (sql) => {
      [org, docType] = [randomUUID(), randomUUID()];
      await sql`insert into organizations (id, name, tax_id) values (${org}, 'Org', ${org.slice(0, 20)})`;
      await sql`insert into document_types (id, code, name) values (${docType}, 'CC', 'Cédula')`;
    });
  });

  it('CA-1 el monto mensual es obligatorio y mayor que 0', async () => {
    await withRuntimeSql(async (sql) => {
      await expect(contract(sql, '0.00')).rejects.toThrow(/provider_contracts_monthly_amount_ck/);
    });
  });

  it('CA-2 y CA-3 agrupa por mes trabajado, no por fecha de pago, y no cuenta borrados', async () => {
    await withRuntimeSql(async (sql) => {
      const c = await contract(sql);
      await payment(sql, c, [2026, 8, 1], '2026-08-03', '300.00');
      // Semana 4 de agosto pagada en septiembre: cuenta para agosto.
      await payment(sql, c, [2026, 8, 4], '2026-08-24', '200.00', '2026-09-02');
      await payment(sql, c, [2026, 9, 1], '2026-09-01', '50.00');
      const deleted = await payment(sql, c, [2026, 9, 2], '2026-09-08', '999.00');
      await sql`update fee_payments set deleted_at = now() where id = ${deleted}`;

      expect(await monthTotals(sql, c)).toEqual([
        { period_year: 2026, period_month: 8, paid_amount: '500.00' },
        { period_year: 2026, period_month: 9, paid_amount: '50.00' },
      ]);
    });
  });

  it('CA-4 un pago que supera el monto mensual se guarda, y el monto se puede bajar', async () => {
    await withRuntimeSql(async (sql) => {
      const c = await contract(sql, '1000.00');
      await payment(sql, c, [2026, 10, 1], '2026-10-01', '1500.00');
      await sql`update provider_contracts set monthly_amount = '100.00' where id = ${c}`;
      expect(await monthTotals(sql, c)).toEqual([
        { period_year: 2026, period_month: 10, paid_amount: '1500.00' },
      ]);
    });
  });
});
