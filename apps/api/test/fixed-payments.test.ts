import { type Contract, type ContractOption, type ServiceProvider } from '@anderp/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import { documentTypes } from '../src/db/schema';
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
