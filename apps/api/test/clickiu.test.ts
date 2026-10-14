import { type ClickiuMovement, type ClickiuSummary, todayIn } from '@anderp/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import { auditLogs } from '../src/db/schema';
import { createTestApp, type TestApp } from './setup/create-test-app';
import { as, seedTwoOrgs, type TwoOrgs } from './setup/fixtures';
import { resetDb } from './setup/reset-db';

let t: TestApp;
let db: Database;
let s: TwoOrgs;

const api = () => as(t, s.orgA.admin.token);

async function create(body: Record<string, unknown>): Promise<ClickiuMovement> {
  return (await api().post('/clickiu/movements', body).expect(201)).body as ClickiuMovement;
}
const recharge = (amount: string, movementDate = '2026-09-01') =>
  create({ type: 'recharge', movementDate, amount });
const sale = (amount: string, movementDate = '2026-09-10', status = 'credit') =>
  create({ type: 'sale', status, movementDate, amount });

const list = async (query: string) =>
  (await api().get(`/clickiu/movements?${query}`).expect(200)).body as ClickiuMovement[];
const summary = async (query: string) =>
  (await api().get(`/clickiu/summary?${query}`).expect(200)).body as ClickiuSummary;

beforeAll(async () => {
  await resetDb();
  t = await createTestApp();
  db = t.app.get<Database>(DB);
});

beforeEach(async () => {
  s = await seedTwoOrgs(t, db);
});

afterAll(async () => {
  await t.close();
});

describe('Movimientos de Clic Kiu', () => {
  it('CA-1 y CA-2 crea recargas y ventas; la descripción es opcional', async () => {
    expect(await recharge('1000.00')).toMatchObject({
      type: 'recharge',
      status: null,
      movementDate: '2026-09-01',
      amount: '1000.00',
      description: null,
    });
    const created = await create({
      type: 'sale',
      status: 'credit',
      movementDate: '2026-09-02',
      amount: '250.50',
      description: 'Tiquete Bogotá–Cartagena',
    });
    expect(created).toMatchObject({ status: 'credit', description: 'Tiquete Bogotá–Cartagena' });
    expect((await api().get(`/clickiu/movements/${created.id}`).expect(200)).body).toEqual(created);
  });

  it('CA-2 una venta sin estado o una recarga con estado responde CLICKIU_SALE_STATUS_REQUIRED', async () => {
    const r = await recharge('1000.00');
    const noStatus = await api()
      .post('/clickiu/movements', { type: 'sale', movementDate: '2026-09-02', amount: '10.00' })
      .expect(422);
    expect(noStatus.body.code).toBe('CLICKIU_SALE_STATUS_REQUIRED');
    const withStatus = await api()
      .patch(`/clickiu/movements/${r.id}`, { status: 'completed' })
      .expect(422);
    expect(withStatus.body.code).toBe('CLICKIU_SALE_STATUS_REQUIRED');
  });

  it('CA-3 el tipo no cambia', async () => {
    const r = await recharge('1000.00');
    const res = await api()
      .patch(`/clickiu/movements/${r.id}`, { type: 'sale', status: 'credit' })
      .expect(422);
    expect(res.body.code).toBe('CLICKIU_MOVEMENT_TYPE_IMMUTABLE');
  });

  it('CA-4 y CA-13 edita y cambia el estado en los dos sentidos, con auditoría', async () => {
    await recharge('1000.00');
    const v = await sale('300.00');
    const done = await api()
      .patch(`/clickiu/movements/${v.id}`, { status: 'completed', description: 'Pagó' })
      .expect(200);
    expect(done.body).toMatchObject({ status: 'completed', description: 'Pagó' });
    await api().patch(`/clickiu/movements/${v.id}`, { status: 'credit' }).expect(200);
    await api().delete(`/clickiu/movements/${v.id}`).expect(204);

    const logs = await db
      .select({ action: auditLogs.action, changes: auditLogs.changes })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'clickiu_movement'), eq(auditLogs.entityId, v.id)));
    expect(logs.map((l) => l.action).sort()).toEqual([
      'clickiu_movement.create',
      'clickiu_movement.delete',
      'clickiu_movement.update',
      'clickiu_movement.update',
    ]);
    expect(logs.find((l) => l.action === 'clickiu_movement.update')!.changes).toMatchObject({
      before: { status: 'credit' },
      after: { status: 'completed' },
    });
  });

  it('CA-5 un movimiento borrado no aparece ni se encuentra', async () => {
    const r = await recharge('1000.00');
    await api().delete(`/clickiu/movements/${r.id}`).expect(204);
    expect(await list('from=2026-09-01&to=2026-09-30')).toEqual([]);
    await api().get(`/clickiu/movements/${r.id}`).expect(404);
  });

  it('CA-7 una venta mayor que el saldo se rechaza y no se guarda', async () => {
    await recharge('1000.00');
    const res = await api()
      .post('/clickiu/movements', {
        type: 'sale',
        status: 'credit',
        movementDate: '2026-09-02',
        amount: '1000.01',
      })
      .expect(422);
    expect(res.body.code).toBe('CLICKIU_INSUFFICIENT_BALANCE');
    expect(await list('from=2026-09-01&to=2026-09-30')).toHaveLength(1);
  });

  it('CA-10 sin fechas devuelve solo el mes actual', async () => {
    const today = todayIn();
    await recharge('1.00', today);
    await recharge('1.00', '2000-01-01');
    expect((await list('')).map((r) => r.movementDate)).toEqual([today]);
  });

  it('CA-14 exige autenticación y el super admin también opera', async () => {
    await t.http.get('/api/v1/clickiu/movements').expect(401);
    await as(t, s.superAdmin.token)
      .post('/clickiu/movements', { type: 'recharge', movementDate: '2026-09-01', amount: '5.00' })
      .expect(201);
  });
});

describe('Listado y filtros', () => {
  beforeEach(async () => {
    await recharge('1000.00', '2026-09-01');
    await sale('300.00', '2026-09-10', 'credit');
    await sale('200.00', '2026-10-05', 'completed');
    await recharge('500.00', '2026-10-10');
  });

  it('CA-10 filtra por rango con los bordes incluidos, ordenado por fecha descendente', async () => {
    const rows = await list('from=2026-09-10&to=2026-10-10');
    expect(rows.map((r) => r.movementDate)).toEqual(['2026-10-10', '2026-10-05', '2026-09-10']);
    expect(await list('from=2026-10-06')).toHaveLength(1);
    expect(await list('to=2026-09-01')).toHaveLength(1);
  });

  it('CA-10 y CA-11 filtra por tipo y por estado (el estado deja fuera las recargas)', async () => {
    const range = 'from=2026-09-01&to=2026-10-31';
    expect(await list(`${range}&type=recharge`)).toHaveLength(2);
    expect(await list(`${range}&type=sale`)).toHaveLength(2);
    const credit = await list(`${range}&status=credit`);
    expect(credit.map((r) => [r.type, r.amount])).toEqual([['sale', '300.00']]);
  });

  it('CA-10 rechaza from posterior a to', async () => {
    const res = await api().get('/clickiu/movements?from=2026-10-02&to=2026-10-01').expect(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('CA-12 el resumen suma lo filtrado; el saldo al corte cuenta todo hasta "to"', async () => {
    expect(await summary('from=2026-10-01&to=2026-10-31')).toEqual({
      totalRecharged: '500.00',
      totalSold: '200.00',
      creditAmount: '0.00',
      balanceAsOf: '1000.00',
      currentBalance: '1000.00',
    });
    expect((await summary('from=2026-10-01&to=2026-10-07')).balanceAsOf).toBe('500.00');
    expect(await summary('from=2026-09-01&to=2026-10-31&type=sale&status=credit')).toEqual({
      totalRecharged: '0.00',
      totalSold: '300.00',
      creditAmount: '300.00',
      balanceAsOf: '1000.00',
      currentBalance: '1000.00',
    });
    expect((await summary('from=2026-09-01')).balanceAsOf).toBe('1000.00');
  });
});

describe('Aislamiento', () => {
  it('CA-15 otra organización no ve ni toca los movimientos ni el saldo ajenos', async () => {
    await recharge('1000.00');
    const v = await sale('300.00');
    const other = as(t, s.orgB.admin.token);

    await other.get(`/clickiu/movements/${v.id}`).expect(404);
    await other.patch(`/clickiu/movements/${v.id}`, { status: 'completed' }).expect(404);
    await other.delete(`/clickiu/movements/${v.id}`).expect(404);
    expect(
      (await other.get('/clickiu/movements?from=2026-09-01&to=2026-09-30').expect(200)).body,
    ).toEqual([]);

    // El saldo de A no sirve para vender en B, y los movimientos de B no cambian el resumen de A.
    const noBalance = await other
      .post('/clickiu/movements', {
        type: 'sale',
        status: 'credit',
        movementDate: '2026-09-02',
        amount: '1.00',
      })
      .expect(422);
    expect(noBalance.body.code).toBe('CLICKIU_INSUFFICIENT_BALANCE');
    await other
      .post('/clickiu/movements', {
        type: 'recharge',
        movementDate: '2026-09-02',
        amount: '5000.00',
      })
      .expect(201);
    expect(await summary('from=2026-09-01&to=2026-09-30')).toEqual({
      totalRecharged: '1000.00',
      totalSold: '300.00',
      creditAmount: '300.00',
      balanceAsOf: '700.00',
      currentBalance: '700.00',
    });
    expect((await api().get(`/clickiu/movements/${v.id}`).expect(200)).body).toMatchObject({
      status: 'credit',
    });
  });
});
