import { addDays, type ObligationDetail, type Notifications, todayIn } from '@anderp/shared';
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
/** Otro usuario de la organización A (el super admin del escenario es miembro de A). */
const otherUser = () => as(t, s.superAdmin.token);
const inDays = (n: number) => addDays(todayIn(), n);

async function create(firstDueDate: string, concept = `IVA ${Math.random()}`) {
  return (
    await api()
      .post('/obligations', { entityName: 'DIAN', concept, frequency: 'bimonthly', firstDueDate })
      .expect(201)
  ).body as ObligationDetail;
}

const notifications = async (client = api()) =>
  (await client.get('/notifications').expect(200)).body as Notifications;

const dismiss = (dueDateId: string, kind: string, client = api()) =>
  client.post('/notifications/dismiss', { dueDateId, kind });

const auditCount = async () => (await db.select().from(auditLogs)).length;

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

describe('Qué es una notificación', () => {
  it('CA-1 y CA-7 solo los pendientes Próximos y Vencidos, primero los vencidos', async () => {
    const upcoming = await create(inDays(3), 'IVA');
    const overdue = await create(inDays(-2), 'Renta');
    await create(inDays(30), 'ICA');
    const none = await create(inDays(5), 'Retención');
    await api().delete(`/obligations/${none.id}/pending`).expect(204);
    const done = await create(inDays(4), 'Predial');
    await api()
      .post(`/obligations/${done.id}/complete`, { dueDateId: done.pending!.id })
      .expect(200);

    expect(await notifications()).toEqual({
      unseen: true,
      items: [
        {
          dueDateId: overdue.pending!.id,
          kind: 'obligation_overdue',
          obligationId: overdue.id,
          entityName: 'DIAN',
          concept: 'Renta',
          dueDate: inDays(-2),
          daysLeft: -2,
          seen: false,
        },
        {
          dueDateId: upcoming.pending!.id,
          kind: 'obligation_upcoming',
          obligationId: upcoming.id,
          entityName: 'DIAN',
          concept: 'IVA',
          dueDate: inDays(3),
          daysLeft: 3,
          seen: false,
        },
      ],
    });
  });

  it('CA-2 desaparece al completar el vencimiento, también para quien no la había visto', async () => {
    const o = await create(inDays(2));
    expect((await notifications(otherUser())).items).toHaveLength(1);
    await api().post(`/obligations/${o.id}/complete`, { dueDateId: o.pending!.id }).expect(200);
    expect(await notifications(otherUser())).toEqual({ unseen: false, items: [] });
  });

  it('CA-3 cambiar la fecha dentro del aviso conserva lo visto y lo descartado', async () => {
    const seen = await create(inDays(2));
    const dismissed = await create(inDays(3));
    await api().post('/notifications/seen').expect(204);
    await dismiss(dismissed.pending!.id, 'obligation_upcoming').expect(204);

    await api()
      .put(`/obligations/${seen.id}/pending`, { dueDate: inDays(6) })
      .expect(200);
    await api()
      .put(`/obligations/${dismissed.id}/pending`, { dueDate: inDays(7) })
      .expect(200);

    expect(await notifications()).toMatchObject({
      unseen: false,
      items: [{ dueDateId: seen.pending!.id, dueDate: inDays(6), seen: true }],
    });
  });

  it('CA-4 una Próxima descartada vuelve como Vencida, sin revisar', async () => {
    const o = await create(inDays(2));
    await api().post('/notifications/seen').expect(204);
    await dismiss(o.pending!.id, 'obligation_upcoming').expect(204);
    expect((await notifications()).items).toEqual([]);

    await api()
      .put(`/obligations/${o.id}/pending`, { dueDate: inDays(-1) })
      .expect(200);
    expect(await notifications()).toMatchObject({
      unseen: true,
      items: [{ dueDateId: o.pending!.id, kind: 'obligation_overdue', seen: false }],
    });
  });
});

describe('Visto y descartado', () => {
  it('CA-7 y CA-8 abrir el panel apaga el punto; una alerta nueva lo vuelve a encender', async () => {
    const first = await create(inDays(1));
    expect((await notifications()).unseen).toBe(true);

    await api().post('/notifications/seen').expect(204);
    await api().post('/notifications/seen').expect(204);
    expect(await notifications()).toMatchObject({ unseen: false, items: [{ seen: true }] });

    const second = await create(inDays(2));
    expect(await notifications()).toMatchObject({
      unseen: true,
      items: [
        { dueDateId: first.pending!.id, seen: true },
        { dueDateId: second.pending!.id, seen: false },
      ],
    });
  });

  it('CA-5 lo visto y descartado es de cada usuario', async () => {
    const o = await create(inDays(1));
    await api().post('/notifications/seen').expect(204);
    await dismiss(o.pending!.id, 'obligation_upcoming').expect(204);

    expect(await notifications()).toEqual({ unseen: false, items: [] });
    expect(await notifications(otherUser())).toMatchObject({
      unseen: true,
      items: [{ dueDateId: o.pending!.id, seen: false }],
    });
  });

  it('CA-9 descartar quita la notificación, es idempotente y solo acepta una activa', async () => {
    const o = await create(inDays(1));
    const done = await create(inDays(2));
    await api()
      .post(`/obligations/${done.id}/complete`, { dueDateId: done.pending!.id })
      .expect(200);

    const wrongKind = await dismiss(o.pending!.id, 'obligation_overdue').expect(404);
    expect(wrongKind.body.code).toBe('NOTIFICATION_NOT_FOUND');
    await dismiss(done.pending!.id, 'obligation_upcoming').expect(404);
    await dismiss(o.pending!.id, 'nada').expect(422);

    await dismiss(o.pending!.id, 'obligation_upcoming').expect(204);
    await dismiss(o.pending!.id, 'obligation_upcoming').expect(204);
    expect(await notifications()).toEqual({ unseen: false, items: [] });
  });

  it('CA-6 ver y descartar no se auditan', async () => {
    const o = await create(inDays(1));
    const before = await auditCount();
    await api().post('/notifications/seen').expect(204);
    await dismiss(o.pending!.id, 'obligation_upcoming').expect(204);
    expect(await auditCount()).toBe(before);
  });
});

describe('Permisos y aislamiento', () => {
  it('CA-10 sin sesión responde 401', async () => {
    await t.http.get('/api/v1/notifications').expect(401);
    await t.http.post('/api/v1/notifications/seen').expect(401);
  });

  it('CA-11 otra organización no ve ni toca las notificaciones ajenas', async () => {
    const o = await create(inDays(1));
    const other = as(t, s.orgB.admin.token);

    expect(await notifications(other)).toEqual({ unseen: false, items: [] });
    await other.post('/notifications/seen').expect(204);
    const res = await dismiss(o.pending!.id, 'obligation_upcoming', other).expect(404);
    expect(res.body.code).toBe('NOTIFICATION_NOT_FOUND');

    expect(await notifications()).toMatchObject({ unseen: true, items: [{ seen: false }] });
  });
});

it('los endpoints de notificaciones aparecen en OpenAPI', async () => {
  const { paths } = (await t.http.get('/api/docs-json').expect(200)).body as {
    paths: Record<string, unknown>;
  };
  expect(Object.keys(paths)).toEqual(
    expect.arrayContaining([
      '/api/v1/notifications',
      '/api/v1/notifications/seen',
      '/api/v1/notifications/dismiss',
    ]),
  );
});
