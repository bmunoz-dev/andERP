import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDb, withRuntimeSql } from './setup/reset-db';

/** Reglas de F03 que viven en la base de datos (constitución, principio III). */
describe('service_providers y provider_contracts en la base de datos', () => {
  let orgA: string;
  let orgB: string;
  let documentTypeId: string;
  let bankId: string;
  let accountTypeId: string;

  async function provider(sql: postgres.Sql, organizationId = orgA): Promise<string> {
    const id = randomUUID();
    await sql`insert into service_providers (id, organization_id, name, document_type_id, document_number)
      values (${id}, ${organizationId}, 'Ana Pérez', ${documentTypeId}, ${randomUUID().slice(0, 12)})`;
    return id;
  }

  async function contract(
    sql: postgres.Sql,
    providerId: string,
    start: string,
    end: string | null,
  ): Promise<string> {
    const id = randomUUID();
    await sql`insert into provider_contracts
      (id, organization_id, service_provider_id, start_date, end_date, work_agreement, payment_frequency, monthly_amount)
      values (${id}, ${orgA}, ${providerId}, ${start}, ${end}, 'Asesoría', 'weekly', '1000000.00')`;
    return id;
  }

  beforeAll(async () => {
    await resetDb();
    await withRuntimeSql(async (sql) => {
      [orgA, orgB, documentTypeId, bankId, accountTypeId] = [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
      ];
      for (const id of [orgA, orgB]) {
        await sql`insert into organizations (id, name, tax_id) values (${id}, 'Org', ${id.slice(0, 20)})`;
      }
      await sql`insert into document_types (id, code, name) values (${documentTypeId}, 'CC', 'Cédula')`;
      await sql`insert into banks (id, name) values (${bankId}, 'Banco de prueba')`;
      await sql`insert into account_types (id, name) values (${accountTypeId}, 'Ahorros')`;
    });
  });

  describe('service_providers', () => {
    it('la cuenta bancaria va completa o no va', async () => {
      await withRuntimeSql(async (sql) => {
        await expect(
          sql`insert into service_providers (organization_id, id, name, document_type_id, document_number, bank_id)
              values (${orgA}, ${randomUUID()}, 'X', ${documentTypeId}, 'DOC-1', ${bankId})`,
        ).rejects.toThrow(/service_providers_bank_all_or_none/);
        await sql`insert into service_providers
          (organization_id, id, name, document_type_id, document_number, bank_id, account_type_id, account_number)
          values (${orgA}, ${randomUUID()}, 'X', ${documentTypeId}, 'DOC-2', ${bankId}, ${accountTypeId}, '123')`;
      });
    });

    it('el documento es único por organización y se puede recrear tras un borrado', async () => {
      await withRuntimeSql(async (sql) => {
        const id = randomUUID();
        await sql`insert into service_providers (organization_id, id, name, document_type_id, document_number)
                  values (${orgA}, ${id}, 'X', ${documentTypeId}, 'DOC-3')`;
        await expect(
          sql`insert into service_providers (organization_id, id, name, document_type_id, document_number)
              values (${orgA}, ${randomUUID()}, 'Y', ${documentTypeId}, 'DOC-3')`,
        ).rejects.toThrow(/service_providers_document_uq/);
        await sql`insert into service_providers (organization_id, id, name, document_type_id, document_number)
                  values (${orgB}, ${randomUUID()}, 'Y', ${documentTypeId}, 'DOC-3')`;

        await sql`update service_providers set deleted_at = now() where id = ${id}`;
        await sql`insert into service_providers (organization_id, id, name, document_type_id, document_number)
                  values (${orgA}, ${randomUUID()}, 'Z', ${documentTypeId}, 'DOC-3')`;
      });
    });
  });

  describe('provider_contracts', () => {
    it('la FK compuesta impide apuntar a un prestador de otra organización', async () => {
      await withRuntimeSql(async (sql) => {
        const providerB = await provider(sql, orgB);
        await expect(contract(sql, providerB, '2026-01-01', null)).rejects.toThrow(
          /provider_contracts_provider_fk/,
        );
      });
    });

    it('valor mayor que cero y fecha de fin no anterior al inicio', async () => {
      await withRuntimeSql(async (sql) => {
        const providerId = await provider(sql);
        await expect(
          sql`insert into provider_contracts
            (organization_id, service_provider_id, id, start_date, work_agreement, payment_frequency, monthly_amount)
            values (${orgA}, ${providerId}, ${randomUUID()}, '2026-01-01', 'x', 'weekly', 0)`,
        ).rejects.toThrow(/provider_contracts_monthly_amount_ck/);
        await expect(contract(sql, providerId, '2026-02-01', '2026-01-31')).rejects.toThrow(
          /provider_contracts_date_range_ck/,
        );
      });
    });

    describe('CA-7 los contratos de un prestador no se cruzan', () => {
      let providerId: string;
      beforeEach(async () => {
        await withRuntimeSql(async (sql) => {
          providerId = await provider(sql);
          await contract(sql, providerId, '2026-01-01', '2026-06-30');
        });
      });

      it.each([
        ['se cruza al final', '2026-06-30', '2026-12-31'],
        ['queda adentro', '2026-03-01', '2026-03-31'],
        ['lo envuelve', '2025-12-01', '2027-01-01'],
        ['abierto desde antes', '2025-06-01', null],
      ])('%s → provider_contracts_no_overlap', async (_label, start, end) => {
        await withRuntimeSql(async (sql) => {
          await expect(contract(sql, providerId, start, end)).rejects.toThrow(
            /provider_contracts_no_overlap/,
          );
        });
      });

      it('un contrato contiguo sí se permite', async () => {
        await withRuntimeSql(async (sql) => {
          await contract(sql, providerId, '2026-07-01', null);
        });
      });

      it('un contrato abierto bloquea cualquiera posterior', async () => {
        await withRuntimeSql(async (sql) => {
          await contract(sql, providerId, '2026-07-01', null);
          await expect(contract(sql, providerId, '2030-01-01', '2030-12-31')).rejects.toThrow(
            /provider_contracts_no_overlap/,
          );
        });
      });

      it('un contrato borrado deja de bloquear', async () => {
        await withRuntimeSql(async (sql) => {
          const id = await contract(sql, providerId, '2026-07-01', '2026-12-31');
          await sql`update provider_contracts set deleted_at = now() where id = ${id}`;
          await contract(sql, providerId, '2026-08-01', '2026-08-31');
        });
      });

      it('otro prestador puede tener las mismas fechas', async () => {
        await withRuntimeSql(async (sql) => {
          await contract(sql, await provider(sql), '2026-01-01', '2026-06-30');
        });
      });
    });
  });
});
