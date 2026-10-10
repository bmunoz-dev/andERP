import { todayIn } from '@anderp/shared';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDb, withRuntimeSql } from './setup/reset-db';

/** Reglas de F09 que viven en la base de datos (constitución, principio III). */
describe('F09 en la base de datos', () => {
  let org: string;
  let documentTypeId: string;

  async function provider(sql: postgres.Sql): Promise<string> {
    const id = randomUUID();
    await sql`insert into service_providers (id, organization_id, name, document_type_id, document_number)
      values (${id}, ${org}, 'Ana Pérez', ${documentTypeId}, ${randomUUID().slice(0, 12)})`;
    return id;
  }

  const contract = (sql: postgres.Sql, providerId: string, start: string, end: string | null) =>
    sql`insert into provider_contracts
      (id, organization_id, service_provider_id, start_date, end_date, work_agreement, payment_frequency, monthly_amount)
      values (${randomUUID()}, ${org}, ${providerId}, ${start}, ${end}, 'Asesoría', 'weekly', '1000000.00')`;

  const setActive = (sql: postgres.Sql, providerId: string, isActive: boolean) =>
    sql`update service_providers set is_active = ${isActive} where id = ${providerId}`;

  beforeAll(async () => {
    await resetDb();
    await withRuntimeSql(async (sql) => {
      [org, documentTypeId] = [randomUUID(), randomUUID()];
      await sql`insert into organizations (id, name, tax_id) values (${org}, 'Org', ${org.slice(0, 20)})`;
      await sql`insert into document_types (id, code, name) values (${documentTypeId}, 'CC', 'Cédula')`;
    });
  });

  it('CA-1 un prestador nace activo', async () => {
    await withRuntimeSql(async (sql) => {
      const id = await provider(sql);
      const [row] = await sql<
        { is_active: boolean }[]
      >`select is_active from service_providers where id = ${id}`;
      expect(row?.is_active).toBe(true);
    });
  });

  it('CA-2 un prestador inactivo no recibe contratos nuevos', async () => {
    await withRuntimeSql(async (sql) => {
      const id = await provider(sql);
      await setActive(sql, id, false);
      await expect(contract(sql, id, '2026-01-01', null)).rejects.toThrow('PROVIDER_INACTIVE');
      await setActive(sql, id, true);
      await contract(sql, id, '2026-01-01', null);
    });
  });

  it('CA-3 no se desactiva con un contrato vigente o futuro; sí con uno vencido', async () => {
    const today = todayIn();
    await withRuntimeSql(async (sql) => {
      const open = await provider(sql);
      await contract(sql, open, '2020-01-01', null);
      await expect(setActive(sql, open, false)).rejects.toThrow('PROVIDER_HAS_ACTIVE_CONTRACT');

      const endsToday = await provider(sql);
      await contract(sql, endsToday, '2020-01-01', today);
      await expect(setActive(sql, endsToday, false)).rejects.toThrow(
        'PROVIDER_HAS_ACTIVE_CONTRACT',
      );

      const future = await provider(sql);
      await contract(sql, future, '2099-01-01', '2099-12-31');
      await expect(setActive(sql, future, false)).rejects.toThrow('PROVIDER_HAS_ACTIVE_CONTRACT');

      const ended = await provider(sql);
      await contract(sql, ended, '2020-01-01', '2020-12-31');
      await setActive(sql, ended, false);

      // Un contrato borrado no cuenta.
      const deleted = await provider(sql);
      await contract(sql, deleted, '2020-01-01', null);
      await sql`update provider_contracts set deleted_at = now() where service_provider_id = ${deleted}`;
      await setActive(sql, deleted, false);
    });
  });
});
