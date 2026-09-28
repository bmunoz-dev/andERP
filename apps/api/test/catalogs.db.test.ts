import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDb, withRuntimeSql } from './setup/reset-db';

/** Reglas de F02 que viven en la base de datos (constitución, principio III). */
describe('expense_categories en la base de datos', () => {
  let organizationId: string;
  let otherOrganizationId: string;
  let feesId: string;
  let regularId: string;

  beforeAll(async () => {
    await resetDb();
    await withRuntimeSql(async (sql) => {
      [organizationId, otherOrganizationId] = [randomUUID(), randomUUID()];
      for (const id of [organizationId, otherOrganizationId]) {
        await sql`insert into organizations (id, name, tax_id) values (${id}, 'Org', ${id.slice(0, 20)})`;
      }
      [feesId, regularId] = [randomUUID(), randomUUID()];
      await sql`insert into expense_categories (id, organization_id, name, system_code, sort_order)
        values (${feesId}, ${organizationId}, 'Honorarios', 'FEES', 2),
               (${regularId}, ${organizationId}, 'Comercial', null, 3)`;
    });
  });

  describe('CA-10 la categoría de sistema no se puede alterar', () => {
    it.each([
      ['renombrar', `update expense_categories set name = 'Otro' where id = $1`],
      ['desactivar', `update expense_categories set is_active = false where id = $1`],
      ['borrar (lógico)', `update expense_categories set deleted_at = now() where id = $1`],
      ['quitar el system_code', `update expense_categories set system_code = null where id = $1`],
      ['borrar (físico)', `delete from expense_categories where id = $1`],
    ])('%s → SYSTEM_CATEGORY_PROTECTED', async (_label, statement) => {
      await withRuntimeSql(async (sql) => {
        await expect(sql.unsafe(statement, [feesId])).rejects.toThrow('SYSTEM_CATEGORY_PROTECTED');
      });
    });

    it('sí se puede reordenar', async () => {
      await withRuntimeSql(async (sql) => {
        await sql`update expense_categories set sort_order = 9 where id = ${feesId}`;
      });
    });

    it('no se puede convertir una categoría normal en categoría de sistema', async () => {
      await withRuntimeSql(async (sql) => {
        await expect(
          sql`update expense_categories set system_code = 'FEES2' where id = ${regularId}`,
        ).rejects.toThrow('SYSTEM_CATEGORY_PROTECTED');
      });
    });

    it('una categoría normal se puede renombrar, desactivar y borrar', async () => {
      await withRuntimeSql(async (sql) => {
        await sql`update expense_categories set name = 'Ventas', is_active = false where id = ${regularId}`;
        await sql`update expense_categories set deleted_at = now() where id = ${regularId}`;
      });
    });
  });

  it('el nombre es único por organización, no entre organizaciones', async () => {
    await withRuntimeSql(async (sql) => {
      await expect(
        sql`insert into expense_categories (organization_id, id, name, sort_order)
            values (${organizationId}, ${randomUUID()}, 'Honorarios', 1)`,
      ).rejects.toThrow(/expense_categories_name_uq/);
      await sql`insert into expense_categories (organization_id, id, name, sort_order)
                values (${otherOrganizationId}, ${randomUUID()}, 'Honorarios', 1)`;
    });
  });
});
