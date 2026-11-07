import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';
import { beforeAll, describe, expect, it } from 'vitest';
import { resetDb, withOwnerSql } from './setup/reset-db';

/**
 * F23 CA-12: la migración 0038 se detiene si hay datos que violan las reglas nuevas. Se ejecutan
 * sus bloques `DO` (la barrera) sobre una fila que viola cada regla, creada con los triggers
 * apagados dentro de una transacción que después se revierte.
 */
const barrier = readFileSync(
  path.resolve(__dirname, '../drizzle/0038_data_integrity_guards.sql'),
  'utf8',
)
  .split('--> statement-breakpoint')
  .map((statement) => statement.trim())
  .filter((statement) => /^DO \$\$/m.test(statement));

const ROLLBACK = new Error('rollback');

describe('F23 barrera de la migración', () => {
  let org: string;
  let docType: string;

  beforeAll(async () => {
    await resetDb();
    [org, docType] = [randomUUID(), randomUUID()];
    await withOwnerSql(async (sql) => {
      await sql`insert into anderp.organizations (id, name, tax_id) values (${org}, 'Org', ${org.slice(0, 20)})`;
      await sql`insert into anderp.document_types (id, code, name) values (${docType}, 'CC', 'Cédula')`;
    });
  });

  /** Crea la violación con `setup` y espera que la barrera la rechace con `message`. */
  async function expectBarrier(
    triggers: [table: string, trigger: string][],
    setup: (tx: postgres.TransactionSql) => Promise<void>,
    message: string,
  ) {
    expect(barrier).toHaveLength(3);
    let caught: unknown;
    await withOwnerSql((sql) =>
      sql
        .begin(async (tx) => {
          for (const [table, trigger] of triggers) {
            await tx.unsafe(`alter table anderp.${table} disable trigger ${trigger}`);
          }
          await setup(tx);
          try {
            for (const block of barrier) await tx.unsafe(block);
          } catch (error) {
            caught = error;
          }
          throw ROLLBACK;
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error;
        }),
    );
    expect((caught as Error | undefined)?.message).toContain(message);
  }

  async function providerWithContract(tx: postgres.TransactionSql, end: string | null) {
    const [provider, contract] = [randomUUID(), randomUUID()];
    await tx`insert into anderp.service_providers (id, organization_id, name, document_type_id, document_number)
      values (${provider}, ${org}, 'Ana', ${docType}, ${provider.slice(0, 12)})`;
    await tx`insert into anderp.provider_contracts
      (id, organization_id, service_provider_id, start_date, end_date, work_agreement, payment_frequency, monthly_amount)
      values (${contract}, ${org}, ${provider}, '2020-01-01', ${end}, 'x', 'weekly', '1000.00')`;
    return { provider, contract };
  }

  it('un prestador borrado con contratos', async () => {
    await expectBarrier(
      [['service_providers', 'service_providers_guard_delete']],
      async (tx) => {
        const { provider } = await providerWithContract(tx, '2020-12-31');
        await tx`update anderp.service_providers set deleted_at = now() where id = ${provider}`;
      },
      'prestadores borrados con contratos',
    );
  });

  it('un contrato vigente de un prestador inactivo', async () => {
    await expectBarrier(
      [['service_providers', 'service_providers_guard_deactivation']],
      async (tx) => {
        const { provider } = await providerWithContract(tx, null);
        await tx`update anderp.service_providers set is_active = false where id = ${provider}`;
      },
      'contratos vigentes o futuros de prestadores inactivos',
    );
  });

  it('un pago de honorarios cuyos días suman cero', async () => {
    await expectBarrier(
      [['fee_payment_days', 'fee_payment_days_require_amount']],
      async (tx) => {
        const { contract } = await providerWithContract(tx, null);
        const payment = randomUUID();
        await tx`insert into anderp.fee_payments (id, organization_id, contract_id, period_year, period_month, week_of_month, payment_date)
          values (${payment}, ${org}, ${contract}, 2026, 8, 4, '2026-08-31')`;
        await tx`insert into anderp.fee_payment_days (id, organization_id, fee_payment_id, work_date, amount)
          values (${randomUUID()}, ${org}, ${payment}, '2026-08-24', '0.00')`;
      },
      'pagos de honorarios cuyos días suman cero',
    );
  });

  it('una credencial con un responsable borrado', async () => {
    await expectBarrier(
      [['responsible_persons', 'responsible_persons_guard']],
      async (tx) => {
        const person = randomUUID();
        await tx`insert into anderp.responsible_persons (id, organization_id, first_name, last_name, email)
          values (${person}, ${org}, 'Ana', 'Gómez', 'ana@empresa.co')`;
        const bytes = Buffer.from('x');
        await tx`insert into anderp.entity_credentials (id, organization_id, responsible_person_id, entity_name,
            username, password_ciphertext, password_iv, password_auth_tag, key_version)
          values (${randomUUID()}, ${org}, ${person}, 'DIAN', 'u', ${bytes}, ${bytes}, ${bytes}, 1)`;
        await tx`update anderp.responsible_persons set deleted_at = now() where id = ${person}`;
      },
      'credenciales con un responsable borrado',
    );
  });
});
