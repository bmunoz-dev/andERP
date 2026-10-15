import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, withRuntimeSql } from './setup/reset-db';

/** Reglas de F13 que viven en la base de datos: nombres únicos, un pendiente e historial fijo. */
describe('F13 en la base de datos', () => {
  let org: string;
  let user: string;

  async function obligation(sql: postgres.Sql, entity = 'DIAN', concept = 'IVA', noticeDays = 15) {
    const id = randomUUID();
    await sql`insert into payment_obligations (id, organization_id, entity_name, concept, frequency, notice_days)
      values (${id}, ${org}, ${entity}, ${concept}, 'quarterly', ${noticeDays})`;
    return id;
  }

  async function dueDate(sql: postgres.Sql, obligationId: string, date: string, completed = false) {
    const id = randomUUID();
    await sql`insert into obligation_due_dates (id, organization_id, obligation_id, due_date, completed_at, completed_by)
      values (${id}, ${org}, ${obligationId}, ${date}, ${completed ? new Date() : null}, ${completed ? user : null})`;
    return id;
  }

  beforeEach(async () => {
    await resetDb();
    [org, user] = [randomUUID(), randomUUID()];
    await withRuntimeSql(async (sql) => {
      await sql`insert into organizations (id, name, tax_id) values (${org}, 'Org', ${org.slice(0, 20)})`;
      await sql`insert into users (id, email, first_name, last_name) values (${user}, ${`${user}@x.co`}, 'Ana', 'Pérez')`;
    });
  });

  it('CA-1 los días de aviso van de 0 a 365', async () => {
    await withRuntimeSql(async (sql) => {
      await obligation(sql, 'DIAN', 'Renta', 0);
      await obligation(sql, 'DIAN', 'ICA', 365);
      await expect(obligation(sql, 'DIAN', 'Retención', 366)).rejects.toThrow(
        /payment_obligations_notice_days_ck/,
      );
    });
  });

  it('CA-2 entidad y concepto no se repiten sin distinguir mayúsculas; una borrada no cuenta', async () => {
    await withRuntimeSql(async (sql) => {
      const first = await obligation(sql, 'DIAN', 'IVA bimestral');
      await expect(obligation(sql, 'dian', 'iva BIMESTRAL')).rejects.toThrow(
        /payment_obligations_name_uq/,
      );
      await sql`update payment_obligations set deleted_at = now() where id = ${first}`;
      await obligation(sql, 'dian', 'iva BIMESTRAL');
    });
  });

  it('CA-5 una obligación tiene como máximo un pendiente; uno borrado no cuenta', async () => {
    await withRuntimeSql(async (sql) => {
      const o = await obligation(sql);
      await dueDate(sql, o, '2026-01-15', true);
      const pending = await dueDate(sql, o, '2026-04-15');
      await expect(dueDate(sql, o, '2026-07-15')).rejects.toThrow(
        /obligation_due_dates_pending_uq/,
      );
      await sql`update obligation_due_dates set deleted_at = now() where id = ${pending}`;
      await dueDate(sql, o, '2026-07-15');
    });
  });

  it('la fecha no se repite en una obligación y completado exige quién', async () => {
    await withRuntimeSql(async (sql) => {
      const o = await obligation(sql);
      await dueDate(sql, o, '2026-01-15', true);
      await expect(dueDate(sql, o, '2026-01-15')).rejects.toThrow(/obligation_due_dates_date_uq/);
      await expect(
        sql`insert into obligation_due_dates (id, organization_id, obligation_id, due_date, completed_at)
          values (${randomUUID()}, ${org}, ${o}, '2026-02-15', now())`,
      ).rejects.toThrow(/obligation_due_dates_completed_ck/);
    });
  });

  it('el vencimiento no puede apuntar a una obligación de otra organización', async () => {
    await withRuntimeSql(async (sql) => {
      const o = await obligation(sql);
      const other = randomUUID();
      await sql`insert into organizations (id, name, tax_id) values (${other}, 'Otra', ${other.slice(0, 20)})`;
      await expect(
        sql`insert into obligation_due_dates (id, organization_id, obligation_id, due_date)
          values (${randomUUID()}, ${other}, ${o}, '2026-02-15')`,
      ).rejects.toThrow(/obligation_due_dates_obligation_fk/);
    });
  });

  it('CA-9 un vencimiento completado no cambia de fecha ni de obligación; uno pendiente sí', async () => {
    await withRuntimeSql(async (sql) => {
      const o = await obligation(sql);
      const other = await obligation(sql, 'Fontur', 'Contribución');
      const done = await dueDate(sql, o, '2026-01-15', true);
      const pending = await dueDate(sql, o, '2026-04-15');

      await expect(
        sql`update obligation_due_dates set due_date = '2026-01-20' where id = ${done}`,
      ).rejects.toThrow(/DUE_DATE_COMPLETED_IMMUTABLE/);
      await expect(
        sql`update obligation_due_dates set obligation_id = ${other} where id = ${done}`,
      ).rejects.toThrow(/DUE_DATE_COMPLETED_IMMUTABLE/);

      await sql`update obligation_due_dates set due_date = '2026-04-20' where id = ${pending}`;
      await sql`update obligation_due_dates set completed_at = now(), completed_by = ${user} where id = ${pending}`;
    });
  });
});
