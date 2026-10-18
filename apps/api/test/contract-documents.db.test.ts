import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDb, withRuntimeSql } from './setup/reset-db';

const PDF = 'application/pdf';
const SHA = 'a'.repeat(64);

/** Reglas de F17 que viven en la base de datos (CA-1). */
describe('F17 en la base de datos', () => {
  let org: string;
  let docType: string;

  async function contract(sql: postgres.Sql) {
    const id = randomUUID();
    const provider = randomUUID();
    await sql`insert into service_providers (id, organization_id, name, document_type_id, document_number)
      values (${provider}, ${org}, 'Ana', ${docType}, ${provider.slice(0, 12)})`;
    await sql`insert into provider_contracts
      (id, organization_id, service_provider_id, start_date, work_agreement, payment_frequency, monthly_amount)
      values (${id}, ${org}, ${provider}, '2026-01-01', 'x', 'monthly', '1000.00')`;
    return id;
  }

  async function document(
    sql: postgres.Sql,
    contractId: string,
    overrides: { contentType?: string; sizeBytes?: number; sha256?: string } = {},
  ) {
    const id = randomUUID();
    await sql`insert into contract_documents
      (id, organization_id, contract_id, storage_key, file_name, content_type, size_bytes, sha256)
      values (${id}, ${org}, ${contractId}, ${`org/${org}/contracts/${contractId}/${id}`}, 'c.pdf',
              ${overrides.contentType ?? PDF}, ${overrides.sizeBytes ?? 100}, ${overrides.sha256 ?? SHA})`;
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

  it('CA-1 un solo archivo vigente por contrato; los borrados no cuentan', async () => {
    await withRuntimeSql(async (sql) => {
      const c = await contract(sql);
      const first = await document(sql, c);
      await expect(document(sql, c)).rejects.toThrow(/contract_documents_active_uq/);
      await sql`update contract_documents set deleted_at = now() where id = ${first}`;
      await document(sql, c);
    });
  });

  it('CA-1 tipo, tamaño y hash válidos', async () => {
    await withRuntimeSql(async (sql) => {
      const c = await contract(sql);
      await expect(document(sql, c, { contentType: 'text/html' })).rejects.toThrow(
        /contract_documents_type_ck/,
      );
      await expect(document(sql, c, { sizeBytes: 0 })).rejects.toThrow(
        /contract_documents_size_ck/,
      );
      await expect(document(sql, c, { sizeBytes: 10_485_761 })).rejects.toThrow(
        /contract_documents_size_ck/,
      );
      await expect(document(sql, c, { sha256: 'A'.repeat(64) })).rejects.toThrow(
        /contract_documents_sha256_ck/,
      );
      const id = await document(sql, c, { sizeBytes: 10_485_760 });
      // La ruta del objeto es única.
      await sql`update contract_documents set deleted_at = now() where id = ${id}`;
      await expect(
        sql`insert into contract_documents
          (id, organization_id, contract_id, storage_key, file_name, content_type, size_bytes, sha256)
          select ${randomUUID()}, organization_id, contract_id, storage_key, file_name, content_type, size_bytes, sha256
            from contract_documents where id = ${id}`,
      ).rejects.toThrow(/contract_documents_storage_key_uq/);
    });
  });

  it('CA-1 el contrato tiene que ser de la misma organización (FK compuesta)', async () => {
    await withRuntimeSql(async (sql) => {
      const c = await contract(sql);
      const other = randomUUID();
      await sql`insert into organizations (id, name, tax_id) values (${other}, 'Otra', ${other.slice(0, 20)})`;
      await expect(
        sql`insert into contract_documents
          (id, organization_id, contract_id, storage_key, file_name, content_type, size_bytes, sha256)
          values (${randomUUID()}, ${other}, ${c}, ${randomUUID()}, 'c.pdf', ${PDF}, 1, ${SHA})`,
      ).rejects.toThrow(/contract_documents_contract_fk/);
    });
  });
});
