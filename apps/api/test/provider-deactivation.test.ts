import type { Contract, FeePayment, ServiceProvider } from '@anderp/shared';
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
let provider: ServiceProvider;

const api = () => as(t, s.orgA.admin.token);

const contract = (overrides: Record<string, unknown> = {}) =>
  api().post(`/service-providers/${provider.id}/contracts`, {
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    workAgreement: 'Asesoría',
    paymentFrequency: 'weekly',
    totalAmount: '1000000.00',
    ...overrides,
  });

const setActive = (isActive: boolean, client = api()) =>
  client.patch(`/service-providers/${provider.id}`, { isActive });

beforeAll(async () => {
  await resetDb();
  t = await createTestApp();
  db = t.app.get<Database>(DB);
  const [cc] = await db.insert(documentTypes).values({ code: 'CC', name: 'Cédula' }).returning();
  documentTypeId = cc!.id;
});

beforeEach(async () => {
  s = await seedTwoOrgs(t, db);
  provider = (
    await api()
      .post('/service-providers', {
        name: 'Ana Pérez',
        documentTypeId,
        documentNumber: String(Math.floor(Math.random() * 1e9)),
      })
      .expect(201)
  ).body as ServiceProvider;
});

afterAll(async () => {
  await t.close();
});

describe('Desactivar prestadores (F09)', () => {
  it('CA-1 nace activo y se puede desactivar y volver a activar', async () => {
    expect(provider.isActive).toBe(true);
    expect(((await setActive(false).expect(200)).body as ServiceProvider).isActive).toBe(false);
    const list = (await api().get('/service-providers').expect(200)).body as ServiceProvider[];
    expect(list.find((p) => p.id === provider.id)?.isActive).toBe(false);
    expect(((await setActive(true).expect(200)).body as ServiceProvider).isActive).toBe(true);
  });

  it('CA-2 un prestador inactivo no recibe contratos nuevos', async () => {
    await setActive(false).expect(200);
    const res = await contract();
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PROVIDER_INACTIVE');
    await setActive(true).expect(200);
    await contract().expect(201);
  });

  it('CA-3 no se desactiva con un contrato vigente o futuro', async () => {
    await contract({ startDate: '2026-08-01', endDate: null }).expect(201);
    const res = await setActive(false);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PROVIDER_HAS_ACTIVE_CONTRACT');
    const unchanged = (await api().get(`/service-providers/${provider.id}`).expect(200))
      .body as ServiceProvider;
    expect(unchanged.isActive).toBe(true);
  });

  it('CA-4 con el prestador inactivo se registran y editan pagos atrasados', async () => {
    const ended = (await contract().expect(201)).body as Contract;
    await setActive(false).expect(200);

    const body = {
      contractId: ended.id,
      periodYear: 2026,
      periodMonth: 8,
      weekOfMonth: 4,
      paymentDate: '2026-10-05',
      notes: null,
      days: [{ workDate: '2026-08-24', amount: '100000.00', isHoliday: false }],
    };
    const payment = (await api().post('/fee-payments', body).expect(201)).body as FeePayment;
    await api()
      .put(`/fee-payments/${payment.id}`, {
        ...body,
        days: [{ workDate: '2026-08-24', amount: '120000.00', isHoliday: false }],
      })
      .expect(200);
  });

  it('CA-5 otra organización recibe 404', async () => {
    const res = await setActive(false, as(t, s.orgB.admin.token));
    expect(res.status).toBe(404);
  });
});
