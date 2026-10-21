import {
  type AppModule,
  APP_MODULES,
  type AuthProfile,
  type LedgerEntry,
  type Organization,
} from '@anderp/shared';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import { appModule, auditLogs, documentTypes } from '../src/db/schema';
import { REQUIRED_MODULE, SuperAdminGuard } from '../src/modules/auth/http/guards';
import { createTestApp, type TestApp } from './setup/create-test-app';
import { as, seedTwoOrgs, TEST_PASSWORD, type TwoOrgs } from './setup/fixtures';
import { resetDb, withOwnerSql } from './setup/reset-db';

/** Paquetes por organización de F19 (design.md decisión 19). */
describe('F19 módulos: base de datos', () => {
  beforeEach(resetDb);

  it('la lista de la API y la de @anderp/shared son la misma', () => {
    expect(appModule.enumValues).toEqual([...APP_MODULES]);
  });

  it('el enum `app_module` tiene los cuatro paquetes', async () => {
    await withOwnerSql(async (sql) => {
      const rows = await sql<{ label: string }[]>`
        select enumlabel as label from pg_enum
        where enumtypid = 'anderp.app_module'::regtype order by enumsortorder`;
      expect(rows.map((r) => r.label)).toEqual([
        'staff_payments',
        'credentials',
        'air_accounts',
        'agenda',
      ]);
    });
  });

  it('CA-2: una organización nueva nace sin paquetes', async () => {
    await withOwnerSql(async (sql) => {
      const [row] = await sql<{ modules: string[] }[]>`
        insert into anderp.organizations (id, name, tax_id)
        values (${randomUUID()}, 'Nueva', '900111222-3')
        returning modules`;
      expect(row?.modules).toEqual([]);
    });
  });

  it('rechaza un paquete que no existe', async () => {
    await withOwnerSql(async (sql) => {
      await expect(
        sql`insert into anderp.organizations (id, name, tax_id, modules)
          values (${randomUUID()}, 'Mala', '900111222-4', '{inventado}')`,
      ).rejects.toThrow(/invalid input value for enum/);
    });
  });

  it('CA-2: la migración deja con los cuatro paquetes a las organizaciones que ya existían', async () => {
    // La base de pruebas se migra vacía, así que se ejecuta el relleno de la migración a mano.
    const dir = path.resolve(__dirname, '../drizzle');
    const file = readdirSync(dir).find((f) => f.startsWith('0034_'));
    const backfill = /UPDATE anderp\.organizations SET modules = [^;]+;/i.exec(
      readFileSync(path.join(dir, file ?? ''), 'utf8'),
    )?.[0];
    expect(backfill).toBeDefined();

    await withOwnerSql(async (sql) => {
      await sql`insert into anderp.organizations (id, name, tax_id)
        values (${randomUUID()}, 'Vieja', '900111222-5')`;
      await sql.unsafe(backfill ?? '');
      const [row] = await sql<{ modules: string[] }[]>`select modules from anderp.organizations`;
      expect(row?.modules).toEqual(['staff_payments', 'credentials', 'air_accounts', 'agenda']);
    });
  });
});

describe('F19 módulos: API', () => {
  let t: TestApp;
  let db: Database;
  let s: TwoOrgs;

  beforeAll(async () => {
    await resetDb();
    t = await createTestApp();
    db = t.app.get<Database>(DB);
    await db.insert(documentTypes).values({ code: 'CC', name: 'Cédula' });
  });

  beforeEach(async () => {
    s = await seedTwoOrgs(t, db);
  });

  afterAll(async () => {
    await t.close();
  });

  const newOrg = () => ({
    name: `Cliente ${randomUUID().slice(0, 6)}`,
    taxId: randomUUID().slice(0, 18),
    admin: { email: `admin-${randomUUID()}@cliente.co`, firstName: 'Laura', lastName: 'Ríos' },
  });

  const getOrg = async (id: string) =>
    (await as(t, s.superAdmin.token).get(`/platform/organizations/${id}`).expect(200))
      .body as Organization;

  it('CA-4 sin `modules` la organización nace solo con Base', async () => {
    const res = await as(t, s.superAdmin.token)
      .post('/platform/organizations', newOrg())
      .expect(201);
    expect((res.body as Organization).modules).toEqual([]);
  });

  it('CA-4 crea con los paquetes elegidos y descarta los repetidos', async () => {
    const res = await as(t, s.superAdmin.token)
      .post('/platform/organizations', {
        ...newOrg(),
        modules: ['agenda', 'credentials', 'agenda'],
      })
      .expect(201);
    expect((res.body as Organization).modules).toEqual(['agenda', 'credentials']);
  });

  it('CA-4 CA-5 `modules` reemplaza el conjunto completo y se lee en el detalle y el listado', async () => {
    const url = `/platform/organizations/${s.orgA.id}`;
    expect((await getOrg(s.orgA.id)).modules).toEqual([...APP_MODULES]);

    await as(t, s.superAdmin.token)
      .patch(url, { modules: ['air_accounts'] })
      .expect(200);
    expect((await getOrg(s.orgA.id)).modules).toEqual(['air_accounts']);
    const list = (await as(t, s.superAdmin.token).get('/platform/organizations').expect(200))
      .body as Organization[];
    expect(list.find((o) => o.id === s.orgA.id)?.modules).toEqual(['air_accounts']);

    await as(t, s.superAdmin.token).patch(url, { name: 'Renombrada' }).expect(200);
    expect((await getOrg(s.orgA.id)).modules).toEqual(['air_accounts']);

    await as(t, s.superAdmin.token).patch(url, { modules: [] }).expect(200);
    expect((await getOrg(s.orgA.id)).modules).toEqual([]);
  });

  it('CA-4 un paquete que no existe → 422 VALIDATION_ERROR', async () => {
    const res = await as(t, s.superAdmin.token)
      .patch(`/platform/organizations/${s.orgA.id}`, { modules: ['base'] })
      .expect(422);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    await as(t, s.superAdmin.token)
      .post('/platform/organizations', { ...newOrg(), modules: ['inventado'] })
      .expect(422);
  });

  it('CA-6 un admin de la organización no puede cambiar los paquetes', async () => {
    const res = await as(t, s.orgA.admin.token)
      .patch(`/platform/organizations/${s.orgA.id}`, { modules: [] })
      .expect(403);
    expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
    expect((await getOrg(s.orgA.id)).modules).toEqual([...APP_MODULES]);
  });

  it('CA-7 crear y cambiar paquetes se audita con el antes y el después', async () => {
    const created = (
      await as(t, s.superAdmin.token)
        .post('/platform/organizations', { ...newOrg(), modules: ['agenda'] })
        .expect(201)
    ).body as Organization;
    const [createLog] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'organization.create'), eq(auditLogs.entityId, created.id)));
    expect(createLog?.changes).toMatchObject({ after: { modules: ['agenda'] } });

    await as(t, s.superAdmin.token)
      .patch(`/platform/organizations/${created.id}`, { modules: ['agenda', 'credentials'] })
      .expect(200);
    const [updateLog] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, 'organization.update'), eq(auditLogs.entityId, created.id)));
    expect(updateLog?.changes).toMatchObject({
      before: { modules: ['agenda'] },
      after: { modules: ['agenda', 'credentials'] },
    });
  });

  it('CA-8 CA-11 CA-15 /auth/me y el login llevan `modules`; apagar uno se ve con el mismo token', async () => {
    const login = await t.http
      .post('/api/v1/auth/login')
      .send({ email: s.orgA.admin.email, password: TEST_PASSWORD })
      .expect(200);
    expect((login.body as { user: AuthProfile }).user.modules).toEqual([...APP_MODULES]);

    const me = () => as(t, s.orgA.admin.token).get('/auth/me');
    expect(((await me().expect(200)).body as AuthProfile).modules).toEqual([...APP_MODULES]);

    await as(t, s.superAdmin.token)
      .patch(`/platform/organizations/${s.orgA.id}`, { modules: ['agenda'] })
      .expect(200);
    expect(((await me().expect(200)).body as AuthProfile).modules).toEqual(['agenda']);
  });

  const anyId = randomUUID();
  /** Una ruta GET de cada controlador del paquete (el guard corre antes de que exista el recurso). */
  const ROUTES: Record<AppModule, string[]> = {
    staff_payments: [
      '/service-providers',
      '/contracts',
      '/fee-payments',
      '/fixed-payments',
      `/contracts/${anyId}/document/url`,
    ],
    credentials: ['/credentials', '/responsible-persons'],
    air_accounts: ['/air-operators', '/air-accounts', `/air-accounts/${anyId}/movements`],
    agenda: ['/obligations', '/notifications'],
  };

  const setModules = (orgId: string, modules: AppModule[]) =>
    as(t, s.superAdmin.token).patch(`/platform/organizations/${orgId}`, { modules }).expect(200);

  it('CA-9 cada paquete abre sus rutas y cierra las de los demás con 403 MODULE_DISABLED', async () => {
    for (const open of APP_MODULES) {
      await setModules(s.orgA.id, [open]);
      for (const [module, routes] of Object.entries(ROUTES)) {
        for (const route of routes) {
          const res = await as(t, s.orgA.admin.token).get(route);
          if (module === open) {
            expect(res.status, `${open} abre ${route}`).not.toBe(403);
          } else {
            expect(res.status, `${open} cierra ${route}`).toBe(403);
            expect(res.body).toMatchObject({ code: 'MODULE_DISABLED' });
          }
        }
      }
    }
  });

  it('CA-9 Base sigue abierta sin ningún paquete', async () => {
    await setModules(s.orgA.id, []);
    for (const route of ['/auth/me', '/expense-categories', '/members', '/catalogs/banks']) {
      await as(t, s.orgA.admin.token).get(route).expect(200);
    }
  });

  it('CA-10 el super admin también recibe 403, pero Plataforma sigue abierta', async () => {
    await setModules(s.orgA.id, []);
    const res = await as(t, s.superAdmin.token).get('/air-accounts').expect(403);
    expect(res.body).toMatchObject({ code: 'MODULE_DISABLED' });
    await as(t, s.superAdmin.token).get('/platform/organizations').expect(200);
  });

  it('CA-3 CA-11 apagar corta con el mismo token y encender devuelve los mismos datos', async () => {
    const operator = (
      await as(t, s.orgA.admin.token).post('/air-operators', { name: 'Satena' }).expect(201)
    ).body as { id: string };

    await setModules(s.orgA.id, ['agenda']);
    await as(t, s.orgA.admin.token).get('/air-operators').expect(403);

    await setModules(s.orgA.id, [...APP_MODULES]);
    const list = (await as(t, s.orgA.admin.token).get('/air-operators').expect(200)).body as {
      id: string;
    }[];
    expect(list.map((o) => o.id)).toContain(operator.id);
  });

  it('CA-13 apagar un paquete en A no afecta a B', async () => {
    await setModules(s.orgA.id, []);
    await as(t, s.orgA.admin.token).get('/air-accounts').expect(403);
    await as(t, s.orgB.admin.token).get('/air-accounts').expect(200);
  });

  it('CA-14 con Personal y pagos apagado, el libro de Egresos sigue incluyendo los pagos', async () => {
    const api = () => as(t, s.orgA.admin.token);
    const [cc] = await db.select().from(documentTypes);
    const provider = (
      await api()
        .post('/service-providers', {
          name: 'Persona de prueba',
          documentTypeId: cc?.id,
          documentNumber: '123456789',
        })
        .expect(201)
    ).body as { id: string };
    const contract = (
      await api()
        .post(`/service-providers/${provider.id}/contracts`, {
          startDate: '2026-08-01',
          endDate: '2026-12-31',
          workAgreement: 'Asistente',
          paymentFrequency: 'monthly',
          monthlyAmount: '2000000.00',
          paymentMode: 'fixed',
        })
        .expect(201)
    ).body as { id: string };
    const payment = (
      await api()
        .post('/fixed-payments', {
          contractId: contract.id,
          periodYear: 2026,
          periodMonth: 8,
          paymentDate: '2026-09-02',
          amount: '1000000.00',
        })
        .expect(201)
    ).body as { id: string };

    await setModules(s.orgA.id, []);
    await api().get('/fixed-payments').expect(403);
    const ledger = (await api().get('/reports/expenses/ledger?year=2026&month=9').expect(200))
      .body as LedgerEntry[];
    expect(ledger.find((e) => e.sourceId === payment.id)).toMatchObject({ amount: '1000000.00' });
  });

  it('CA-12 todo controlador declara su paquete o está en la lista de Base o de Plataforma', () => {
    const expected: Record<string, AppModule | 'base' | 'platform'> = {
      'service-providers': 'staff_payments',
      contracts: 'staff_payments',
      'contracts/:id/document': 'staff_payments',
      'fee-payments': 'staff_payments',
      'fixed-payments': 'staff_payments',
      credentials: 'credentials',
      'responsible-persons': 'credentials',
      'air-operators': 'air_accounts',
      'air-accounts': 'air_accounts',
      'air-accounts/:accountId/movements': 'air_accounts',
      obligations: 'agenda',
      notifications: 'agenda',
      auth: 'base',
      health: 'base',
      expenses: 'base',
      'reports/expenses': 'base',
      'expense-categories': 'base',
      members: 'base',
      catalogs: 'base',
      'platform/organizations': 'platform',
      'platform/catalogs': 'platform',
    };

    const controllers = [...t.app.get(ModulesContainer).values()]
      .flatMap((m) => [...m.controllers.values()])
      .flatMap((c) => (c.metatype ? [c.metatype] : []));
    const found: Record<string, AppModule | 'base' | 'platform'> = {};
    for (const controller of controllers) {
      const route = Reflect.getMetadata(PATH_METADATA, controller) as string;
      const required = Reflect.getMetadata(REQUIRED_MODULE, controller) as AppModule | undefined;
      const guards = (Reflect.getMetadata(GUARDS_METADATA, controller) ?? []) as unknown[];
      found[route] = required ?? (guards.includes(SuperAdminGuard) ? 'platform' : 'base');
    }
    expect(found).toEqual(expected);
  });
});
