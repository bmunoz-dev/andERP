import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDb, withRuntimeSql } from './setup/reset-db';

/** Reglas de F06 que viven en la base de datos (constitución, principio III). */
describe('F06 en la base de datos', () => {
  let orgA: string;
  let orgB: string;

  async function person(
    sql: postgres.Sql,
    org: string,
    email: string | null,
    phone: string | null,
  ) {
    const [row] = await sql<{ id: string }[]>`
      insert into responsible_persons (id, organization_id, first_name, last_name, email, phone)
      values (${randomUUID()}, ${org}, 'Ana', 'Gómez', ${email}, ${phone})
      returning id`;
    return row!.id;
  }

  async function credential(
    sql: postgres.Sql,
    org: string,
    entity: string,
    responsibleId: string | null = null,
  ) {
    const bytes = Buffer.from('x');
    const [row] = await sql<{ id: string }[]>`
      insert into entity_credentials (id, organization_id, responsible_person_id, entity_name,
        username, password_ciphertext, password_iv, password_auth_tag, key_version)
      values (${randomUUID()}, ${org}, ${responsibleId}, ${entity}, 'usuario', ${bytes}, ${bytes},
        ${bytes}, 1)
      returning id`;
    return row!.id;
  }

  beforeAll(async () => {
    await resetDb();
    await withRuntimeSql(async (sql) => {
      [orgA, orgB] = [randomUUID(), randomUUID()];
      await sql`insert into organizations (id, name, tax_id)
        values (${orgA}, 'A', ${orgA.slice(0, 20)}), (${orgB}, 'B', ${orgB.slice(0, 20)})`;
    });
  });

  it('CA-1 el responsable necesita email o teléfono', async () => {
    await withRuntimeSql(async (sql) => {
      await expect(person(sql, orgA, null, null)).rejects.toThrow('responsible_persons_contact_ck');
      await person(sql, orgA, 'ana@empresa.co', null);
      await person(sql, orgA, null, '3001234567');
    });
  });

  it('CA-4 no se repite entidad + usuario, salvo que la anterior esté borrada', async () => {
    await withRuntimeSql(async (sql) => {
      const id = await credential(sql, orgA, 'DIAN');
      await expect(credential(sql, orgA, 'DIAN')).rejects.toThrow('entity_credentials_uq');
      await credential(sql, orgB, 'DIAN');
      await sql`update entity_credentials set deleted_at = now() where id = ${id}`;
      await credential(sql, orgA, 'DIAN');
    });
  });

  it('la FK compuesta impide asignar un responsable de otra organización', async () => {
    await withRuntimeSql(async (sql) => {
      const other = await person(sql, orgB, 'b@empresa.co', null);
      await expect(credential(sql, orgA, 'Banco', other)).rejects.toThrow(
        'entity_credentials_responsible_fk',
      );
    });
  });

  it('CA-2 un responsable con credenciales vigentes no se borra (trigger)', async () => {
    await withRuntimeSql(async (sql) => {
      const responsible = await person(sql, orgA, 'r@empresa.co', null);
      const id = await credential(sql, orgA, 'Secretaría', responsible);
      const remove = () =>
        sql`update responsible_persons set deleted_at = now() where id = ${responsible}`;
      await expect(remove()).rejects.toThrow('RESPONSIBLE_IN_USE');
      await sql`update entity_credentials set deleted_at = now() where id = ${id}`;
      await remove();
    });
  });
});
