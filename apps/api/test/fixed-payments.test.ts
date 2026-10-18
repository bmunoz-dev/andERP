import {
  type Contract,
  type ContractOption,
  type FixedPayment,
  type LedgerEntry,
  type ServiceProvider,
} from '@anderp/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import { auditLogs, documentTypes } from '../src/db/schema';
import { createTestApp, type TestApp } from './setup/create-test-app';
import { as, seedTwoOrgs, type TwoOrgs } from './setup/fixtures';
import { resetDb } from './setup/reset-db';

let t: TestApp;
let db: Database;
let s: TwoOrgs;
let documentTypeId: string;

const api = () => as(t, s.orgA.admin.token);

async function newContract(overrides: Record<string, unknown> = {}): Promise<Contract> {
  const provider = (
    await api()
      .post('/service-providers', {
        name: `Persona ${String(Math.random()).slice(2, 8)}`,
        documentTypeId,
        documentNumber: String(Math.floor(Math.random() * 1e9)),
      })
      .expect(201)
  ).body as ServiceProvider;
  return (
    await api()
      .post(`/service-providers/${provider.id}/contracts`, {
        startDate: '2026-08-01',
        endDate: '2026-12-31',
        workAgreement: 'Asistente',
        paymentFrequency: 'monthly',
        monthlyAmount: '2000000.00',
        ...overrides,
      })
      .expect(201)
  ).body as Contract;
}

const feePayment = (contractId: string) => ({
  contractId,
  periodYear: 2026,
  periodMonth: 8,
  weekOfMonth: 1,
  paymentDate: '2026-08-07',
  days: [{ workDate: '2026-08-03', amount: '100000.00', isHoliday: false }],
});

beforeAll(async () => {
  await resetDb();
  t = await createTestApp();
  db = t.app.get<Database>(DB);
  const [cc] = await db.insert(documentTypes).values({ code: 'CC', name: 'Cédula' }).returning();
  documentTypeId = cc!.id;
});

beforeEach(async () => {
  s = await seedTwoOrgs(t, db);
});

afterAll(async () => {
  await t.close();
});

describe('Forma de pago del contrato', () => {
  it('CA-1 y CA-2 por días si no se indica; se guarda y se devuelve', async () => {
    expect(await newContract()).toMatchObject({ paymentMode: 'daily', hasPayments: false });
    const fixed = await newContract({ paymentMode: 'fixed' });
    expect(fixed.paymentMode).toBe('fixed');

    const options = (await api().get('/contracts?overlaps=2026-08-01..2026-08-31').expect(200))
      .body as ContractOption[];
    expect(options.find((o) => o.id === fixed.id)?.paymentMode).toBe('fixed');
  });

  it('CA-3 cambiar la forma de pago con pagos → 422; sin pagos se puede', async () => {
    const empty = await newContract();
    expect(
      (await api().patch(`/contracts/${empty.id}`, { paymentMode: 'fixed' }).expect(200)).body,
    ).toMatchObject({ paymentMode: 'fixed' });

    const paid = await newContract();
    await api().post('/fee-payments', feePayment(paid.id)).expect(201);
    expect(
      (await api().get(`/service-providers/${paid.serviceProviderId}/contracts`).expect(200)).body,
    ).toMatchObject([{ hasPayments: true }]);
    expect(
      (await api().patch(`/contracts/${paid.id}`, { paymentMode: 'fixed' }).expect(422)).body,
    ).toMatchObject({ code: 'CONTRACT_PAYMENT_MODE_LOCKED' });
    // Editar otra cosa no toca la forma de pago.
    await api().patch(`/contracts/${paid.id}`, { workAgreement: 'Otro' }).expect(200);
  });

  it('CA-12 un pago por días sobre un contrato de monto fijo → 422', async () => {
    const fixed = await newContract({ paymentMode: 'fixed' });
    expect(
      (await api().post('/fee-payments', feePayment(fixed.id)).expect(422)).body,
    ).toMatchObject({
      code: 'CONTRACT_PAYMENT_MODE_MISMATCH',
    });
  });
});

describe('Pagos de monto fijo', () => {
  let contract: Contract;
  const fixedPayment = (overrides: Record<string, unknown> = {}) => ({
    contractId: contract.id,
    periodYear: 2026,
    periodMonth: 8,
    paymentDate: '2026-09-02',
    amount: '1000000.00',
    ...overrides,
  });

  beforeEach(async () => {
    contract = await newContract({ paymentMode: 'fixed' });
  });

  it('CA-4, CA-7 y CA-8 crea varios pagos del mismo mes y los lista con la persona', async () => {
    const first = (await api().post('/fixed-payments', fixedPayment()).expect(201))
      .body as FixedPayment;
    expect(first).toMatchObject({
      contractId: contract.id,
      serviceProvider: { id: contract.serviceProviderId },
      periodYear: 2026,
      periodMonth: 8,
      paymentDate: '2026-09-02',
      amount: '1000000.00',
      notes: null,
    });
    await api()
      .post('/fixed-payments', fixedPayment({ amount: '500000.50', notes: 'Quincena' }))
      .expect(201);

    const list = (await api().get('/fixed-payments?periodYear=2026&periodMonth=8').expect(200))
      .body as FixedPayment[];
    expect(list.map((p) => p.amount).sort()).toEqual(['1000000.00', '500000.50']);
    expect((await api().get('/fixed-payments?periodMonth=9').expect(200)).body).toEqual([]);

    // F10: lo pagado en el mes incluye los pagos fijos.
    const options = (await api().get('/contracts?overlaps=2026-08-01..2026-08-31').expect(200))
      .body as ContractOption[];
    expect(options.find((o) => o.id === contract.id)?.paidInMonth).toBe('1500000.50');
  });

  it('CA-4 valor 0 o mes inválido → 422', async () => {
    await api()
      .post('/fixed-payments', fixedPayment({ amount: '0.00' }))
      .expect(422);
    await api()
      .post('/fixed-payments', fixedPayment({ periodMonth: 13 }))
      .expect(422);
  });

  it('CA-5 y CA-6 contrato por días o mes fuera del contrato → 422', async () => {
    const daily = await newContract();
    expect(
      (
        await api()
          .post('/fixed-payments', fixedPayment({ contractId: daily.id }))
          .expect(422)
      ).body,
    ).toMatchObject({ code: 'CONTRACT_PAYMENT_MODE_MISMATCH' });
    expect(
      (
        await api()
          .post('/fixed-payments', fixedPayment({ periodMonth: 7 }))
          .expect(422)
      ).body,
    ).toMatchObject({ code: 'FIXED_PAYMENT_OUTSIDE_CONTRACT' });
  });

  it('CA-9 a CA-11 edita fecha, valor y notas; no el periodo; borra; todo auditado', async () => {
    const p = (await api().post('/fixed-payments', fixedPayment()).expect(201))
      .body as FixedPayment;
    await api().patch(`/fixed-payments/${p.id}`, { periodMonth: 9 }).expect(422);
    const edited = (
      await api()
        .patch(`/fixed-payments/${p.id}`, { amount: '900000.00', notes: 'Ajuste' })
        .expect(200)
    ).body as FixedPayment;
    expect(edited).toMatchObject({ amount: '900000.00', notes: 'Ajuste', periodMonth: 8 });

    await api().delete(`/fixed-payments/${p.id}`).expect(204);
    await api().get(`/fixed-payments/${p.id}`).expect(404);

    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'fixed_payment'), eq(auditLogs.entityId, p.id)));
    expect(rows.map((r) => r.action).sort()).toEqual([
      'fixed_payment.create',
      'fixed_payment.delete',
      'fixed_payment.update',
    ]);
    expect(rows.find((r) => r.action === 'fixed_payment.update')?.changes).toMatchObject({
      before: { amount: '1000000.00' },
      after: { amount: '900000.00' },
    });
  });

  it('CA-13 el contrato con pagos fijos no se borra', async () => {
    await api().post('/fixed-payments', fixedPayment()).expect(201);
    expect((await api().delete(`/contracts/${contract.id}`).expect(422)).body).toMatchObject({
      code: 'CONTRACT_HAS_PAYMENTS',
    });
  });

  it('CA-15 aparece en el libro de egresos del mes de su fecha de pago', async () => {
    const p = (await api().post('/fixed-payments', fixedPayment()).expect(201))
      .body as FixedPayment;
    const ledger = (await api().get('/reports/expenses/ledger?year=2026&month=9').expect(200))
      .body as LedgerEntry[];
    expect(ledger.find((e) => e.sourceId === p.id)).toMatchObject({
      source: 'fixed_payment',
      amount: '1000000.00',
    });
  });

  it('CA-18 otra organización no ve ni toca el pago', async () => {
    const p = (await api().post('/fixed-payments', fixedPayment()).expect(201))
      .body as FixedPayment;
    const other = () => as(t, s.orgB.admin.token);
    await other().get(`/fixed-payments/${p.id}`).expect(404);
    await other().patch(`/fixed-payments/${p.id}`, { amount: '1.00' }).expect(404);
    await other().delete(`/fixed-payments/${p.id}`).expect(404);
    expect((await other().get('/fixed-payments').expect(200)).body).toEqual([]);
    await other().post('/fixed-payments', fixedPayment()).expect(404);
  });
});

it('los endpoints de pagos de monto fijo aparecen en OpenAPI', async () => {
  const { paths } = (await t.http.get('/api/docs-json').expect(200)).body as {
    paths: Record<string, unknown>;
  };
  expect(Object.keys(paths)).toEqual(
    expect.arrayContaining(['/api/v1/fixed-payments', '/api/v1/fixed-payments/{id}']),
  );
});
