import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, withRuntimeSql } from './setup/reset-db';

/** Reglas de F14 que viven en la base de datos: una fila por usuario y notificación, sin cruzar organizaciones. */
describe('F14 en la base de datos', () => {
  let org: string;
  let user: string;
  let dueDateId: string;

  const state = (sql: postgres.Sql, organizationId = org, kind = 'obligation_upcoming') =>
    sql`insert into notification_states (id, organization_id, user_id, due_date_id, kind)
      values (${randomUUID()}, ${organizationId}, ${user}, ${dueDateId}, ${kind})`;

  beforeEach(async () => {
    await resetDb();
    [org, user, dueDateId] = [randomUUID(), randomUUID(), randomUUID()];
    const obligation = randomUUID();
    await withRuntimeSql(async (sql) => {
      await sql`insert into organizations (id, name, tax_id) values (${org}, 'Org', ${org.slice(0, 20)})`;
      await sql`insert into users (id, email, first_name, last_name) values (${user}, ${`${user}@x.co`}, 'Ana', 'Pérez')`;
      await sql`insert into payment_obligations (id, organization_id, entity_name, concept, frequency)
        values (${obligation}, ${org}, 'DIAN', 'IVA', 'bimonthly')`;
      await sql`insert into obligation_due_dates (id, organization_id, obligation_id, due_date)
        values (${dueDateId}, ${org}, ${obligation}, '2026-11-12')`;
    });
  });

  it('CA-1 y CA-5 una fila por usuario, vencimiento y tipo', async () => {
    await withRuntimeSql(async (sql) => {
      await state(sql);
      await state(sql, org, 'obligation_overdue');
      await expect(state(sql)).rejects.toThrow(/notification_states_key_uq/);
    });
  });

  it('no puede apuntar a un vencimiento de otra organización', async () => {
    await withRuntimeSql(async (sql) => {
      const other = randomUUID();
      await sql`insert into organizations (id, name, tax_id) values (${other}, 'Otra', ${other.slice(0, 20)})`;
      await expect(state(sql, other)).rejects.toThrow(/notification_states_due_date_fk/);
    });
  });
});
