import type { AirAccount, AirOperator, AirOperatorBalance } from '@anderp/shared';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import { airAccountMovements, auditLogs } from '../src/db/schema';
import { createTestApp, type TestApp } from './setup/create-test-app';
import { as, seedTwoOrgs, type TwoOrgs } from './setup/fixtures';
import { resetDb } from './setup/reset-db';

let t: TestApp;
let db: Database;
let s: TwoOrgs;

const api = () => as(t, s.orgA.admin.token);

const createOperator = async (name = 'Satena') =>
  (await api().post('/air-operators', { name }).expect(201)).body as AirOperator;

const createAccount = async (operatorId: string, name = 'KIU Bogotá', creditLimit = '0.00') =>
  (await api().post('/air-accounts', { operatorId, name, creditLimit }).expect(201))
    .body as AirAccount;

/** Movimiento directo en la base de datos, para probar saldos antes de su API (T005). */
async function insertMovement(
  account: AirAccount,
  type: 'opening_balance' | 'recharge',
  amount: string,
) {
  await db.insert(airAccountMovements).values({
    organizationId: s.orgA.id,
    accountId: account.id,
    type,
    movementDate: '2026-10-01',
    amount,
  });
}

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

describe('Operadores aéreos', () => {
  it('CA-1 crea con el nombre recortado y lista por nombre', async () => {
    expect(await createOperator('  Satena ')).toMatchObject({ name: 'Satena', isActive: true });
    await createOperator('Clic Air');
    const list = (await api().get('/air-operators').expect(200)).body as AirOperator[];
    expect(list.map((o) => o.name)).toEqual(['Clic Air', 'Satena']);
  });

  it('CA-1 el nombre no se repite sin distinguir mayúsculas', async () => {
    await createOperator('Satena');
    const res = await api().post('/air-operators', { name: 'SATENA' }).expect(409);
    expect(res.body.code).toBe('DUPLICATE_NAME');
  });

  it('CA-2 se desactiva, se reactiva y ?active=true lista solo los activos', async () => {
    const o = await createOperator('Satena');
    await createOperator('Clic Air');
    const off = await api().patch(`/air-operators/${o.id}`, { isActive: false }).expect(200);
    expect(off.body).toMatchObject({ isActive: false });
    const active = (await api().get('/air-operators?active=true').expect(200))
      .body as AirOperator[];
    expect(active.map((x) => x.name)).toEqual(['Clic Air']);
    await api()
      .patch(`/air-operators/${o.id}`, { isActive: true, name: 'Satena S.A.' })
      .expect(200);
    expect((await api().get('/air-operators?active=true').expect(200)).body).toHaveLength(2);
  });

  it('CA-24 exige autenticación y el super admin también opera', async () => {
    await t.http.get('/api/v1/air-operators').expect(401);
    await as(t, s.superAdmin.token).post('/air-operators', { name: 'Avianca' }).expect(201);
  });
});

describe('Cuentas aéreas', () => {
  it('CA-3 y CA-20 crea una cuenta y la lista con operador, saldo, disponible y por cobrar', async () => {
    const o = await createOperator('Satena');
    const a = await createAccount(o.id, 'KIU Bogotá', '50000000.00');
    expect(a).toEqual({
      id: a.id,
      operatorId: o.id,
      operatorName: 'Satena',
      name: 'KIU Bogotá',
      creditLimit: '50000000.00',
      isActive: true,
      balance: '0.00',
      available: '50000000.00',
      pendingCollection: '0.00',
    });
    await insertMovement(a, 'opening_balance', '-12400000.00');
    const [listed] = (await api().get('/air-accounts').expect(200)).body as AirAccount[];
    expect(listed).toMatchObject({ balance: '-12400000.00', available: '37600000.00' });
    expect((await api().get(`/air-accounts/${a.id}`).expect(200)).body).toEqual(listed);
  });

  it('CA-3 el nombre se repite en otro operador pero no en el mismo', async () => {
    const satena = await createOperator('Satena');
    const clic = await createOperator('Clic Air');
    await createAccount(satena.id, 'KIU');
    await createAccount(clic.id, 'KIU');
    const res = await api()
      .post('/air-accounts', { operatorId: satena.id, name: 'kiu', creditLimit: '0.00' })
      .expect(409);
    expect(res.body.code).toBe('DUPLICATE_NAME');
  });

  it('CA-2 un operador inactivo no se elige al crear ni al cambiar el operador', async () => {
    const active = await createOperator('Satena');
    const inactive = await createOperator('Clic Air');
    await api().patch(`/air-operators/${inactive.id}`, { isActive: false }).expect(200);
    const created = await api()
      .post('/air-accounts', { operatorId: inactive.id, name: 'KIU', creditLimit: '0.00' })
      .expect(422);
    expect(created.body.code).toBe('AIR_OPERATOR_INACTIVE');
    const a = await createAccount(active.id);
    const moved = await api()
      .patch(`/air-accounts/${a.id}`, { operatorId: inactive.id })
      .expect(422);
    expect(moved.body.code).toBe('AIR_OPERATOR_INACTIVE');
  });

  it('CA-3 y CA-16 edita nombre, límite y estado; bajar el límite bajo la deuda se rechaza', async () => {
    const o = await createOperator();
    const a = await createAccount(o.id, 'KIU', '1000.00');
    await insertMovement(a, 'opening_balance', '-800.00');
    const res = await api().patch(`/air-accounts/${a.id}`, { creditLimit: '799.99' }).expect(422);
    expect(res.body.code).toBe('AIR_ACCOUNT_CREDIT_LIMIT_EXCEEDED');
    expect(
      (
        await api()
          .patch(`/air-accounts/${a.id}`, { name: 'KIU Medellín', creditLimit: '800.00' })
          .expect(200)
      ).body,
    ).toMatchObject({ name: 'KIU Medellín', creditLimit: '800.00', available: '0.00' });

    const p = await createOperator('Clic Air');
    const prepaid = await createAccount(p.id, 'KIU', '500.00');
    await insertMovement(prepaid, 'opening_balance', '-1.00');
    const toPrepaid = await api()
      .patch(`/air-accounts/${prepaid.id}`, { creditLimit: '0.00' })
      .expect(422);
    expect(toPrepaid.body.code).toBe('AIR_ACCOUNT_INSUFFICIENT_BALANCE');
  });

  it('CA-5 se desactiva y ?active= filtra', async () => {
    const o = await createOperator();
    const a = await createAccount(o.id, 'KIU');
    await createAccount(o.id, 'Portal B2B');
    await api().patch(`/air-accounts/${a.id}`, { isActive: false }).expect(200);
    const active = (await api().get('/air-accounts?active=true').expect(200)).body as AirAccount[];
    expect(active.map((x) => x.name)).toEqual(['Portal B2B']);
    const inactive = (await api().get('/air-accounts?active=false').expect(200))
      .body as AirAccount[];
    expect(inactive.map((x) => x.name)).toEqual(['KIU']);
  });

  it('CA-20 el consolidado suma por operador solo las cuentas activas', async () => {
    const satena = await createOperator('Satena');
    const clic = await createOperator('Clic Air');
    const bog = await createAccount(satena.id, 'KIU Bogotá', '1000.00');
    const med = await createAccount(satena.id, 'KIU Medellín', '500.00');
    const off = await createAccount(satena.id, 'Vieja', '9999.00');
    const prepaid = await createAccount(clic.id, 'KIU');
    await insertMovement(bog, 'opening_balance', '-300.00');
    await insertMovement(med, 'opening_balance', '-100.00');
    await insertMovement(prepaid, 'recharge', '250.00');
    await api().patch(`/air-accounts/${off.id}`, { isActive: false }).expect(200);

    const rows = (await api().get('/air-accounts/by-operator').expect(200))
      .body as AirOperatorBalance[];
    expect(rows).toEqual([
      {
        operatorId: clic.id,
        operatorName: 'Clic Air',
        balance: '250.00',
        creditLimit: '0.00',
        available: '250.00',
        pendingCollection: '0.00',
      },
      {
        operatorId: satena.id,
        operatorName: 'Satena',
        balance: '-400.00',
        creditLimit: '1500.00',
        available: '1100.00',
        pendingCollection: '0.00',
      },
    ]);
  });

  it('CA-23 crear y editar una cuenta se audita con antes y después', async () => {
    const o = await createOperator();
    const a = await createAccount(o.id, 'KIU', '100.00');
    await api().patch(`/air-accounts/${a.id}`, { creditLimit: '200.00' }).expect(200);
    const logs = await db
      .select({ action: auditLogs.action, changes: auditLogs.changes })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'air_account'), eq(auditLogs.entityId, a.id)))
      .orderBy(auditLogs.createdAt);
    expect(logs.map((l) => l.action)).toEqual(['air_account.create', 'air_account.update']);
    expect(logs[1]!.changes).toMatchObject({
      before: { creditLimit: '100.00' },
      after: { creditLimit: '200.00' },
    });
  });

  it('una cuenta o un operador inexistente responde 404', async () => {
    await api().get(`/air-accounts/${randomUUID()}`).expect(404);
    await api().patch(`/air-operators/${randomUUID()}`, { name: 'X' }).expect(404);
    const res = await api()
      .post('/air-accounts', { operatorId: randomUUID(), name: 'KIU', creditLimit: '0.00' })
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
