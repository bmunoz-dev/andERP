import { weekOfMonth } from '@anderp/shared';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDb, withRuntimeSql } from './setup/reset-db';

/** Reglas de F05 que viven en la base de datos (constitución, principio III). */
describe('F05 en la base de datos', () => {
  let org: string;
  let fees: string;
  let legal: string;
  let other: string;

  async function expense(
    sql: postgres.Sql,
    categoryId: string,
    date: string,
    amount = '100000.00',
  ) {
    const [row] = await sql<{ id: string; week_of_month: number }[]>`
      insert into expenses (id, organization_id, category_id, concept, payment_date, amount)
      values (${randomUUID()}, ${org}, ${categoryId}, 'Papelería', ${date}, ${amount})
      returning id, week_of_month`;
    return row!;
  }

  beforeAll(async () => {
    await resetDb();
    await withRuntimeSql(async (sql) => {
      [org, fees, legal, other] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
      await sql`insert into organizations (id, name, tax_id) values (${org}, 'Org', ${org.slice(0, 20)})`;
      await sql`insert into expense_categories (id, organization_id, name, system_code, sort_order)
        values (${fees}, ${org}, 'Honorarios', 'FEES', 1),
               (${legal}, ${org}, 'Jurídico', null, 2),
               (${other}, ${org}, 'Gastos extras', null, 3)`;
    });
  });

  it('CA-1 y CA-2 la semana del egreso la calcula la base de datos', async () => {
    await withRuntimeSql(async (sql) => {
      expect((await expense(sql, legal, '2026-08-07')).week_of_month).toBe(1);
      expect((await expense(sql, legal, '2026-08-31')).week_of_month).toBe(4);
    });
  });

  it('CA-3 un egreso manual no puede ir en la categoría de honorarios (trigger)', async () => {
    await withRuntimeSql(async (sql) => {
      await expect(expense(sql, fees, '2026-08-10')).rejects.toThrow('FEES_CATEGORY_NOT_ALLOWED');
      const e = await expense(sql, legal, '2026-08-10');
      await expect(
        sql`update expenses set category_id = ${fees} where id = ${e.id}`,
      ).rejects.toThrow('FEES_CATEGORY_NOT_ALLOWED');
    });
  });

  it('CA-7 una categoría con egresos no se borra; se puede desactivar', async () => {
    await withRuntimeSql(async (sql) => {
      const e = await expense(sql, other, '2026-08-11');
      await expect(
        sql`update expense_categories set deleted_at = now() where id = ${other}`,
      ).rejects.toThrow('CATEGORY_HAS_EXPENSES');
      await sql`update expense_categories set is_active = false where id = ${other}`;
      await sql`update expenses set deleted_at = now() where id = ${e.id}`;
      await sql`update expense_categories set deleted_at = now() where id = ${other}`;
    });
  });

  it('CA-8 a CA-10 el libro une egresos y honorarios por fecha de pago, sin doble conteo', async () => {
    await withRuntimeSql(async (sql) => {
      const [docType, provider, contract, payment] = [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
      ];
      await sql`insert into document_types (id, code, name) values (${docType}, 'CC', 'Cédula')`;
      await sql`insert into service_providers (id, organization_id, name, document_type_id, document_number)
        values (${provider}, ${org}, 'Ana Pérez', ${docType}, '123456')`;
      await sql`insert into provider_contracts
        (id, organization_id, service_provider_id, start_date, work_agreement, payment_frequency, monthly_amount)
        values (${contract}, ${org}, ${provider}, '2026-01-01', 'x', 'weekly', '9000000.00')`;
      // Semana 4 de agosto, pagada el 2 de septiembre.
      await sql`insert into fee_payments (id, organization_id, contract_id, period_year, period_month, week_of_month, payment_date)
        values (${payment}, ${org}, ${contract}, 2026, 8, 4, '2026-09-02')`;
      await sql`insert into fee_payment_days (id, organization_id, fee_payment_id, work_date, amount)
        values (${randomUUID()}, ${org}, ${payment}, '2026-08-24', '30000.00'),
               (${randomUUID()}, ${org}, ${payment}, '2026-08-25', '20000.00')`;
      await expense(sql, legal, '2026-09-03', '100000.00');
      const deleted = await expense(sql, legal, '2026-09-04', '777.00');
      await sql`update expenses set deleted_at = now() where id = ${deleted.id}`;

      const rows = await sql<
        {
          source: string;
          category_id: string;
          concept: string;
          week_of_month: number;
          amount: string;
        }[]
      >`select source, category_id, concept, week_of_month, amount::text from v_expense_ledger
        where organization_id = ${org} and payment_date between '2026-09-01' and '2026-09-30'
        order by source`;
      expect(rows).toEqual([
        {
          source: 'fee_payment',
          category_id: fees,
          concept: 'Honorarios – Ana Pérez – Sem 4 08/2026',
          week_of_month: 1,
          amount: '50000.00',
        },
        {
          source: 'manual',
          category_id: legal,
          concept: 'Papelería',
          week_of_month: 1,
          amount: '100000.00',
        },
      ]);

      const [total] = await sql<{ total: string }[]>`
        select sum(amount)::text as total from v_expense_ledger
        where organization_id = ${org} and payment_date between '2026-09-01' and '2026-09-30'`;
      expect(total?.total).toBe('150000.00');

      await sql`update fee_payments set deleted_at = now() where id = ${payment}`;
      const after =
        await sql`select 1 from v_expense_ledger where source = 'fee_payment' and source_id = ${payment}`;
      expect(after).toHaveLength(0);
    });
  });

  it('CA-2 week_of_month(date) coincide con weekOfMonth() de TypeScript en 2024–2030', async () => {
    await withRuntimeSql(async (sql) => {
      const rows = await sql<{ day: string; week: number }[]>`
        select d::date::text as day, week_of_month(d::date) as week
        from generate_series('2024-01-01'::date, '2030-12-31'::date, interval '1 day') d`;
      expect(rows).toHaveLength(2557);
      const mismatches = rows.filter((r) => r.week !== weekOfMonth(r.day));
      expect(mismatches).toEqual([]);
    });
  });
});
