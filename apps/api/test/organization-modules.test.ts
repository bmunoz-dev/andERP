import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, withOwnerSql } from './setup/reset-db';

/** Paquetes por organización de F19 (design.md decisión 19). */
describe('F19 módulos: base de datos', () => {
  beforeEach(resetDb);

  it('el enum `app_module` tiene los cuatro paquetes', async () => {
    await withOwnerSql(async (sql) => {
      const rows = await sql<{ label: string }[]>`
        select enumlabel as label from pg_enum
        where enumtypid = 'anderp.app_module'::regtype order by enumsortorder`;
      expect(rows.map((r) => r.label)).toEqual([
        'staff_payments',
        'credentials',
        'air_accounts',
        'agenda',
      ]);
    });
  });

  it('CA-2: una organización nueva nace sin paquetes', async () => {
    await withOwnerSql(async (sql) => {
      const [row] = await sql<{ modules: string[] }[]>`
        insert into anderp.organizations (id, name, tax_id)
        values (${randomUUID()}, 'Nueva', '900111222-3')
        returning modules`;
      expect(row?.modules).toEqual([]);
    });
  });

  it('rechaza un paquete que no existe', async () => {
    await withOwnerSql(async (sql) => {
      await expect(
        sql`insert into anderp.organizations (id, name, tax_id, modules)
          values (${randomUUID()}, 'Mala', '900111222-4', '{inventado}')`,
      ).rejects.toThrow(/invalid input value for enum/);
    });
  });

  it('CA-2: la migración deja con los cuatro paquetes a las organizaciones que ya existían', async () => {
    // La base de pruebas se migra vacía, así que se ejecuta el relleno de la migración a mano.
    const dir = path.resolve(__dirname, '../drizzle');
    const file = readdirSync(dir).find((f) => f.startsWith('0034_'));
    const backfill = /UPDATE anderp\.organizations SET modules = [^;]+;/i.exec(
      readFileSync(path.join(dir, file ?? ''), 'utf8'),
    )?.[0];
    expect(backfill).toBeDefined();

    await withOwnerSql(async (sql) => {
      await sql`insert into anderp.organizations (id, name, tax_id)
        values (${randomUUID()}, 'Vieja', '900111222-5')`;
      await sql.unsafe(backfill ?? '');
      const [row] = await sql<{ modules: string[] }[]>`select modules from anderp.organizations`;
      expect(row?.modules).toEqual(['staff_payments', 'credentials', 'air_accounts', 'agenda']);
    });
  });
});
