import {
  type AirAccount,
  type AirMovement,
  type AirMovementSummary,
  type AirOperator,
  type AirOperatorBalance,
  todayIn,
} from '@anderp/shared';
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

describe('Movimientos de una cuenta aérea', () => {
  const base = (account: AirAccount) => `/air-accounts/${account.id}/movements`;

  const issueBody = (overrides: Record<string, unknown> = {}) => ({
    type: 'issue',
    movementDate: '2026-09-10',
    pnr: 'k4j2ll',
    ticketNumber: String(Math.floor(Math.random() * 1e13)).padStart(13, '0'),
    passenger: 'Ana Pérez',
    netFare: '120.00',
    taxes: '30.00',
    ...overrides,
  });

  async function post(account: AirAccount, body: Record<string, unknown>) {
    return (await api().post(base(account), body).expect(201)).body as AirMovement;
  }
  const entry = (account: AirAccount, type: string, amount: string, movementDate = '2026-09-01') =>
    post(account, { type, movementDate, amount });

  /** Cuenta prepago (límite 0) o a crédito, con un operador nuevo. */
  async function newAccount(creditLimit = '0.00') {
    const o = await createOperator(`Operador ${randomUUID().slice(0, 8)}`);
    return createAccount(o.id, 'KIU', creditLimit);
  }

  const list = async (account: AirAccount, query = '') =>
    (
      await api()
        .get(`${base(account)}?${query}`)
        .expect(200)
    ).body as AirMovement[];
  const summary = async (account: AirAccount, query = '') =>
    (
      await api()
        .get(`${base(account)}/summary?${query}`)
        .expect(200)
    ).body as AirMovementSummary;

  it('CA-6 y CA-9 crea cada tipo; la emisión calcula su monto, normaliza el PNR y queda Por cobrar', async () => {
    const acc = await newAccount();
    await entry(acc, 'opening_balance', '50.00');
    for (const type of ['recharge', 'payment', 'refund']) {
      expect(await entry(acc, type, '100.00')).toMatchObject({
        type,
        amount: '100.00',
        pnr: null,
        collectionStatus: null,
      });
    }
    const issue = await post(acc, issueBody({ description: 'BOG-UIB' }));
    expect(issue).toMatchObject({
      accountId: acc.id,
      amount: '150.00',
      pnr: 'K4J2LL',
      passenger: 'Ana Pérez',
      netFare: '120.00',
      taxes: '30.00',
      collectionStatus: 'pending',
      description: 'BOG-UIB',
    });
    expect(
      (
        await api()
          .get(`${base(acc)}/${issue.id}`)
          .expect(200)
      ).body,
    ).toEqual(issue);
    expect((await api().get(`/air-accounts/${acc.id}`).expect(200)).body).toMatchObject({
      balance: '200.00',
      pendingCollection: '150.00',
    });
  });

  it('CA-9 y CA-10 Zod rechaza una emisión incompleta o con monto, y una recarga con tiquete', async () => {
    const acc = await newAccount('1000.00');
    for (const body of [
      issueBody({ pnr: undefined }),
      issueBody({ amount: '150.00' }),
      { type: 'recharge', movementDate: '2026-09-01', amount: '10.00', pnr: 'K4J2LL' },
      { type: 'opening_balance', movementDate: '2026-09-01', amount: '0.00' },
    ]) {
      const res = await api().post(base(acc), body).expect(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('CA-9 y CA-13 editar la tarifa o los impuestos recalcula el monto', async () => {
    const acc = await newAccount('1000.00');
    const issue = await post(acc, issueBody());
    const taxes = await api()
      .patch(`${base(acc)}/${issue.id}`, { taxes: '50.00' })
      .expect(200);
    expect(taxes.body).toMatchObject({ netFare: '120.00', taxes: '50.00', amount: '170.00' });
    const both = await api()
      .patch(`${base(acc)}/${issue.id}`, { netFare: '200.00', taxes: '0.00' })
      .expect(200);
    expect(both.body).toMatchObject({ amount: '200.00' });
  });

  it('CA-10 y CA-12 un PATCH incoherente responde con su code', async () => {
    const acc = await newAccount('1000.00');
    const recharge = await entry(acc, 'recharge', '100.00');
    const issue = await post(acc, issueBody());
    const cases: [string, object, string][] = [
      [recharge.id, { pnr: 'K4J2LL' }, 'AIR_MOVEMENT_TICKET_FIELDS_MISMATCH'],
      [recharge.id, { netFare: '10.00' }, 'AIR_MOVEMENT_TICKET_FIELDS_MISMATCH'],
      [recharge.id, { type: 'payment' }, 'AIR_MOVEMENT_TYPE_IMMUTABLE'],
      [issue.id, { amount: '1.00' }, 'AIR_MOVEMENT_AMOUNT_INVALID'],
      [recharge.id, { amount: '-1.00' }, 'AIR_MOVEMENT_AMOUNT_INVALID'],
    ];
    for (const [id, body, code] of cases) {
      const res = await api()
        .patch(`${base(acc)}/${id}`, body)
        .expect(422);
      expect(res.body.code).toBe(code);
    }
  });

  it('CA-8 y CA-11 un segundo saldo inicial o un tiquete repetido responden 409', async () => {
    const acc = await newAccount('1000.00');
    await entry(acc, 'opening_balance', '10.00');
    const opening = await api()
      .post(base(acc), { type: 'opening_balance', movementDate: '2026-09-01', amount: '5.00' })
      .expect(409);
    expect(opening.body.code).toBe('AIR_OPENING_BALANCE_EXISTS');
    await post(acc, issueBody({ ticketNumber: '1234567890123' }));
    const other = await newAccount('1000.00');
    const ticket = await api()
      .post(base(other), issueBody({ ticketNumber: '1234567890123' }))
      .expect(409);
    expect(ticket.body.code).toBe('AIR_TICKET_NUMBER_TAKEN');
  });

  it('CA-16 prepago: saldo insuficiente; crédito: cupo excedido; justo en 0 se acepta', async () => {
    const prepaid = await newAccount();
    await entry(prepaid, 'recharge', '150.00');
    const over = await api()
      .post(base(prepaid), issueBody({ netFare: '120.01' }))
      .expect(422);
    expect(over.body.code).toBe('AIR_ACCOUNT_INSUFFICIENT_BALANCE');
    await post(prepaid, issueBody());
    expect((await summary(prepaid)).available).toBe('0.00');

    const credit = await newAccount('100.00');
    const exceeded = await api().post(base(credit), issueBody()).expect(422);
    expect(exceeded.body.code).toBe('AIR_ACCOUNT_CREDIT_LIMIT_EXCEEDED');
    expect(await list(credit, 'from=2026-01-01')).toEqual([]);
  });

  it('CA-5 una cuenta inactiva no acepta movimientos nuevos, pero se editan los existentes', async () => {
    const acc = await newAccount();
    const r = await entry(acc, 'recharge', '100.00');
    await api().patch(`/air-accounts/${acc.id}`, { isActive: false }).expect(200);
    const res = await api()
      .post(base(acc), { type: 'recharge', movementDate: '2026-09-01', amount: '1.00' })
      .expect(422);
    expect(res.body.code).toBe('AIR_ACCOUNT_INACTIVE');
    await api()
      .patch(`${base(acc)}/${r.id}`, { amount: '90.00' })
      .expect(200);
  });

  it('CA-13, CA-14 y CA-23 marca como cobrado y vuelve, borra, y todo se audita', async () => {
    const acc = await newAccount('1000.00');
    const issue = await post(acc, issueBody());
    const collected = await api()
      .patch(`${base(acc)}/${issue.id}`, { collectionStatus: 'collected' })
      .expect(200);
    expect(collected.body.collectionStatus).toBe('collected');
    await api()
      .patch(`${base(acc)}/${issue.id}`, { collectionStatus: 'pending' })
      .expect(200);
    await api()
      .delete(`${base(acc)}/${issue.id}`)
      .expect(204);
    await api()
      .get(`${base(acc)}/${issue.id}`)
      .expect(404);
    expect(await list(acc, 'from=2026-01-01')).toEqual([]);
    expect((await summary(acc)).currentBalance).toBe('0.00');

    const logs = await db
      .select({ action: auditLogs.action, changes: auditLogs.changes })
      .from(auditLogs)
      .where(
        and(eq(auditLogs.entityType, 'air_account_movement'), eq(auditLogs.entityId, issue.id)),
      )
      .orderBy(auditLogs.createdAt);
    expect(logs.map((l) => l.action)).toEqual([
      'air_account_movement.create',
      'air_account_movement.update',
      'air_account_movement.update',
      'air_account_movement.delete',
    ]);
    expect(logs[1]!.changes).toMatchObject({
      before: { collectionStatus: 'pending' },
      after: { collectionStatus: 'collected' },
    });
  });

  it('un movimiento solo se alcanza por su propia cuenta', async () => {
    const acc = await newAccount();
    const other = await newAccount();
    const r = await entry(acc, 'recharge', '100.00');
    await api()
      .get(`${base(other)}/${r.id}`)
      .expect(404);
    await api()
      .patch(`${base(other)}/${r.id}`, { amount: '1.00' })
      .expect(404);
    await api()
      .delete(`${base(other)}/${r.id}`)
      .expect(404);
    await api().get(`/air-accounts/${randomUUID()}/movements`).expect(404);
  });

  it('CA-21 filtra por fechas (bordes incluidos), tipo y estado de cobro, ordenado por fecha', async () => {
    const acc = await newAccount('10000.00');
    await entry(acc, 'recharge', '100.00', '2026-08-31');
    await entry(acc, 'recharge', '200.00', '2026-09-01');
    const pending = await post(acc, issueBody({ movementDate: '2026-09-15' }));
    const done = await post(
      acc,
      issueBody({ movementDate: '2026-09-30', collectionStatus: 'collected' }),
    );
    await entry(acc, 'payment', '50.00', '2026-10-01');

    const sept = await list(acc, 'from=2026-09-01&to=2026-09-30');
    expect(sept.map((x) => x.movementDate)).toEqual(['2026-09-30', '2026-09-15', '2026-09-01']);
    expect((await list(acc, 'from=2026-09-01&to=2026-09-30&type=issue')).map((x) => x.id)).toEqual([
      done.id,
      pending.id,
    ]);
    expect(
      (await list(acc, 'from=2026-09-01&to=2026-09-30&collectionStatus=pending')).map((x) => x.id),
    ).toEqual([pending.id]);
    expect((await list(acc, 'from=2026-10-01')).map((x) => x.type)).toEqual(['payment']);
    expect((await list(acc, 'to=2026-08-31')).map((x) => x.amount)).toEqual(['100.00']);
    const bad = await api()
      .get(`${base(acc)}?from=2026-09-02&to=2026-09-01`)
      .expect(422);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
  });

  it('CA-21 sin fechas lista el mes actual en Bogotá', async () => {
    const acc = await newAccount();
    const today = todayIn();
    await entry(acc, 'recharge', '10.00', today);
    await entry(acc, 'recharge', '20.00', '2020-01-01');
    expect((await list(acc)).map((x) => x.movementDate)).toEqual([today]);
  });

  it('CA-22 el resumen suma lo filtrado, el saldo hasta la fecha final y el actual', async () => {
    const acc = await newAccount('1000.00');
    await entry(acc, 'opening_balance', '-100.00', '2026-08-01');
    await entry(acc, 'recharge', '500.00', '2026-09-01');
    await post(acc, issueBody({ movementDate: '2026-09-15' }));
    await post(
      acc,
      issueBody({
        movementDate: '2026-09-20',
        netFare: '50.00',
        taxes: '0.00',
        collectionStatus: 'collected',
      }),
    );
    await entry(acc, 'payment', '40.00', '2026-10-05');

    expect(await summary(acc, 'from=2026-09-01&to=2026-09-30')).toEqual({
      totalIn: '500.00',
      totalIssued: '200.00',
      pendingCollection: '150.00',
      balanceAsOf: '200.00',
      currentBalance: '240.00',
      available: '1240.00',
    });
    expect(await summary(acc, 'from=2026-09-01&to=2026-09-30&type=issue')).toMatchObject({
      totalIn: '0.00',
      totalIssued: '200.00',
      balanceAsOf: '200.00',
    });
  });
});
