import { addDays, type Obligation, type ObligationDetail, todayIn } from '@anderp/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import { auditLogs, obligationDueDates } from '../src/db/schema';
import { createTestApp, type TestApp } from './setup/create-test-app';
import { as, seedTwoOrgs, type TwoOrgs } from './setup/fixtures';
import { resetDb } from './setup/reset-db';

let t: TestApp;
let db: Database;
let s: TwoOrgs;

const api = () => as(t, s.orgA.admin.token);
/** Fecha relativa a hoy en Bogotá: el estado depende del día en que corre la prueba. */
const inDays = (n: number) => addDays(todayIn(), n);

async function create(overrides: Record<string, unknown> = {}): Promise<ObligationDetail> {
  return (
    await api()
      .post('/obligations', {
        entityName: 'DIAN',
        concept: `IVA ${Math.random()}`,
        frequency: 'bimonthly',
        firstDueDate: inDays(30),
        ...overrides,
      })
      .expect(201)
  ).body as ObligationDetail;
}

const list = async (query = '') =>
  (await api().get(`/obligations${query}`).expect(200)).body as Obligation[];

const auditActions = async (entityId: string) =>
  (
    await db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, entityId))
  ).map((l) => l.action);

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

describe('Obligaciones', () => {
  it('CA-1 y CA-3 crea la obligación con su primer vencimiento pendiente', async () => {
    const o = await create({ entityName: ' DIAN ', concept: 'IVA bimestral', notes: 'NIT 900' });
    expect(o).toMatchObject({
      entityName: 'DIAN',
      concept: 'IVA bimestral',
      frequency: 'bimonthly',
      noticeDays: 15,
      notes: 'NIT 900',
      pending: { dueDate: inDays(30) },
      status: 'scheduled',
      daysLeft: 30,
    });
    expect(o.history).toEqual([
      { id: o.pending!.id, dueDate: inDays(30), completedAt: null, completedBy: null },
    ]);
    expect(await auditActions(o.id)).toEqual(['obligation.create']);
  });

  it('CA-2 entidad y concepto no se repiten sin distinguir mayúsculas', async () => {
    await create({ concept: 'Renta' });
    const res = await api()
      .post('/obligations', {
        entityName: 'dian',
        concept: 'RENTA',
        frequency: 'annual',
        firstDueDate: inDays(5),
      })
      .expect(409);
    expect(res.body.code).toBe('DUPLICATE_OBLIGATION');
  });

  it('CA-4 edita y borra con auditoría; una borrada desaparece', async () => {
    const o = await create();
    const edited = await api()
      .patch(`/obligations/${o.id}`, { noticeDays: 40, concept: 'ICA' })
      .expect(200);
    expect(edited.body).toMatchObject({ noticeDays: 40, concept: 'ICA', status: 'upcoming' });
    await api().delete(`/obligations/${o.id}`).expect(204);
    await api().get(`/obligations/${o.id}`).expect(404);
    expect(await list()).toEqual([]);
    expect((await auditActions(o.id)).sort()).toEqual([
      'obligation.create',
      'obligation.delete',
      'obligation.update',
    ]);
  });

  it('CA-14 exige autenticación y el super admin también opera', async () => {
    await t.http.get('/api/v1/obligations').expect(401);
    await as(t, s.superAdmin.token)
      .post('/obligations', {
        entityName: 'Fontur',
        concept: 'Contribución',
        frequency: 'quarterly',
        firstDueDate: inDays(10),
      })
      .expect(201);
  });
});

describe('Agenda', () => {
  it('CA-10 y CA-11 calcula estado y días, y ordena por urgencia', async () => {
    const scheduled = await create({ concept: 'Programada', firstDueDate: inDays(16) });
    const edge = await create({ concept: 'Borde', firstDueDate: inDays(15) });
    const none = await create({ concept: 'Sin próximo' });
    await db
      .update(obligationDueDates)
      .set({ deletedAt: new Date() })
      .where(eq(obligationDueDates.obligationId, none.id));
    const today = await create({ concept: 'Hoy', firstDueDate: inDays(0) });
    const overdue = await create({ concept: 'Vencida', firstDueDate: inDays(-1) });

    const rows = await list();
    expect(rows.map((r) => [r.id, r.status, r.daysLeft])).toEqual([
      [overdue.id, 'overdue', -1],
      [today.id, 'upcoming', 0],
      [edge.id, 'upcoming', 15],
      [scheduled.id, 'scheduled', 16],
      [none.id, 'none', null],
    ]);
    expect(rows.at(-1)!.pending).toBeNull();
    expect((await list('?status=upcoming')).map((r) => r.id)).toEqual([today.id, edge.id]);
  });

  it('CA-10 con 0 días de aviso solo hoy es Próximo', async () => {
    await create({ concept: 'Mañana', noticeDays: 0, firstDueDate: inDays(1) });
    await create({ concept: 'Hoy', noticeDays: 0, firstDueDate: inDays(0) });
    expect((await list()).map((r) => [r.concept, r.status])).toEqual([
      ['Hoy', 'upcoming'],
      ['Mañana', 'scheduled'],
    ]);
  });

  it('CA-12 el detalle trae el historial del más reciente al más antiguo, con quién completó', async () => {
    const o = await create({ firstDueDate: inDays(60) });
    await db.insert(obligationDueDates).values({
      organizationId: s.orgA.id,
      obligationId: o.id,
      dueDate: inDays(-1),
      completedAt: new Date(),
      completedBy: s.orgA.admin.id,
    });
    const detail = (await api().get(`/obligations/${o.id}`).expect(200)).body as ObligationDetail;
    expect(detail.history.map((h) => [h.dueDate, h.completedBy])).toEqual([
      [inDays(60), null],
      [inDays(-1), { id: s.orgA.admin.id, name: 'Ana Gómez' }],
    ]);
    expect(detail.history[1]!.completedAt).toEqual(expect.any(String));
  });
});
