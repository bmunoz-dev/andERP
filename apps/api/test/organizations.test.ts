import type { CatalogItem, ExpenseCategory, Member, Organization } from '@anderp/shared';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import { auditLogs, expenseCategories, organizationMembers, users } from '../src/db/schema';
import { seed } from '../src/db/seed';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher';
import { createTestApp, type TestApp } from './setup/create-test-app';
import {
  as,
  createMember,
  login,
  seedTwoOrgs,
  TEST_PASSWORD,
  type TwoOrgs,
} from './setup/fixtures';
import { resetDb } from './setup/reset-db';

let t: TestApp;
let db: Database;
let s: TwoOrgs;

beforeAll(async () => {
  await resetDb();
  t = await createTestApp();
  db = t.app.get<Database>(DB);
});

beforeEach(async () => {
  s = await seedTwoOrgs(t, db);
  t.mailer.sent = [];
});

afterAll(async () => {
  await t.close();
});

const newOrg = () => ({
  name: `Nueva ${randomUUID().slice(0, 6)}`,
  taxId: randomUUID().slice(0, 18),
  admin: { email: `admin-${randomUUID()}@nueva.co`, firstName: 'Laura', lastName: 'Ríos' },
});

describe('Organizaciones (plataforma)', () => {
  it('CA-1 crea la organización con categorías, primer admin e invitación', async () => {
    const input = newOrg();
    const res = await as(t, s.superAdmin.token).post('/platform/organizations', input).expect(201);
    const organization = res.body as Organization;
    expect(organization).toMatchObject({
      name: input.name,
      taxId: input.taxId,
      status: 'active',
      memberCount: 1,
    });

    const categories = await db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.organizationId, organization.id));
    expect(categories).toHaveLength(7);
    expect(categories.find((c) => c.systemCode === 'FEES')?.name).toBe('Honorarios');

    const [admin] = await db.select().from(users).where(eq(users.email, input.admin.email));
    expect(admin?.passwordHash).toBeNull();
    const link = t.mailer.lastLinkTo(input.admin.email);
    expect(link.pathname).toBe('/activar');
    expect(link.searchParams.get('token')).toBeTruthy();
  });

  it('CA-1 un NIT repetido → 409 TAX_ID_TAKEN', async () => {
    const input = newOrg();
    await as(t, s.superAdmin.token).post('/platform/organizations', input).expect(201);
    const res = await as(t, s.superAdmin.token)
      .post('/platform/organizations', { ...newOrg(), taxId: input.taxId })
      .expect(409);
    expect(res.body).toMatchObject({ code: 'TAX_ID_TAKEN' });
  });

  it('CA-1 reutiliza un usuario existente y solo le avisa, sin invitación', async () => {
    const res = await as(t, s.superAdmin.token)
      .post('/platform/organizations', {
        ...newOrg(),
        admin: { email: s.orgB.admin.email, firstName: 'X', lastName: 'Y' },
      })
      .expect(201);
    expect((res.body as Organization).memberCount).toBe(1);
    const link = t.mailer.lastLinkTo(s.orgB.admin.email);
    expect(link.pathname).toBe('/login');
  });

  it('CA-1 si el correo falla, no queda nada creado', async () => {
    const input = newOrg();
    t.mailer.failNext = new Error('SMTP caído');
    await as(t, s.superAdmin.token).post('/platform/organizations', input).expect(500);
    const list = (await as(t, s.superAdmin.token).get('/platform/organizations').expect(200))
      .body as Organization[];
    expect(list.find((o) => o.taxId === input.taxId)).toBeUndefined();
    expect(await db.select().from(users).where(eq(users.email, input.admin.email))).toHaveLength(0);
  });

  it('CA-2 suspender revoca las sesiones de sus miembros; el super admin sigue entrando', async () => {
    const res = await as(t, s.superAdmin.token)
      .patch(`/platform/organizations/${s.orgA.id}`, { status: 'suspended' })
      .expect(200);
    expect((res.body as Organization).status).toBe('suspended');

    await as(t, s.orgA.admin.token).get('/auth/me').expect(401);
    const denied = await t.http
      .post('/api/v1/auth/login')
      .send({ email: s.orgA.admin.email, password: TEST_PASSWORD })
      .expect(403);
    expect(denied.body).toMatchObject({ code: 'ACCOUNT_DISABLED' });
    await as(t, s.superAdmin.token).get('/auth/me').expect(200);

    await as(t, s.superAdmin.token)
      .patch(`/platform/organizations/${s.orgA.id}`, { status: 'active' })
      .expect(200);
    await login(t, s.orgA.admin.email);
  });

  it('CA-3 un admin no puede usar rutas de plataforma', async () => {
    for (const send of [
      () => as(t, s.orgA.admin.token).get('/platform/organizations'),
      () => as(t, s.orgA.admin.token).post('/platform/organizations', newOrg()),
      () => as(t, s.orgA.admin.token).patch(`/platform/organizations/${s.orgA.id}`, { name: 'X' }),
      () => as(t, s.orgA.admin.token).post('/platform/catalogs/banks', { name: 'Banco X' }),
    ]) {
      const res = await send().expect(403);
      expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
    }
  });
});

describe('Catálogos globales', () => {
  it('CA-4 y CA-5 el super admin los gestiona; los inactivos se ocultan por defecto', async () => {
    const name = `Banco ${randomUUID().slice(0, 8)}`;
    const created = (
      await as(t, s.superAdmin.token).post('/platform/catalogs/banks', { name }).expect(201)
    ).body as CatalogItem;
    expect(created).toMatchObject({ name, isActive: true, code: null });

    const dup = await as(t, s.superAdmin.token)
      .post('/platform/catalogs/banks', { name })
      .expect(409);
    expect(dup.body).toMatchObject({ code: 'DUPLICATE_NAME' });

    await as(t, s.superAdmin.token)
      .patch(`/platform/catalogs/banks/${created.id}`, { isActive: false })
      .expect(200);
    const visible = (await as(t, s.orgA.admin.token).get('/catalogs/banks').expect(200))
      .body as CatalogItem[];
    expect(visible.find((b) => b.id === created.id)).toBeUndefined();
    const all = (
      await as(t, s.orgA.admin.token).get('/catalogs/banks?includeInactive=true').expect(200)
    ).body as CatalogItem[];
    expect(all.find((b) => b.id === created.id)?.isActive).toBe(false);
  });

  it('CA-5 tipos de documento: el código se valida y se normaliza a mayúsculas', async () => {
    const code = `Z${randomUUID()
      .replace(/[^a-z]/g, '')
      .slice(0, 3)}`;
    const res = await as(t, s.superAdmin.token)
      .post('/platform/catalogs/document-types', {
        code: code.toLowerCase(),
        name: 'Otro documento',
      })
      .expect(201);
    expect((res.body as CatalogItem).code).toBe(code.toUpperCase());
    const invalid = await as(t, s.superAdmin.token)
      .post('/platform/catalogs/document-types', { code: 'C-1', name: 'X' })
      .expect(422);
    expect(invalid.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('un tipo de catálogo desconocido → 404', async () => {
    await as(t, s.orgA.admin.token).get('/catalogs/planets').expect(404);
  });

  it('CA-6 el seed carga catálogos y categorías iniciales', async () => {
    const hasher = new Argon2PasswordHasher();
    const { organizationId } = await seed(
      db,
      {
        SEED_ORG_NAME: 'Semilla',
        SEED_ORG_TAX_ID: randomUUID().slice(0, 20),
        SEED_SUPERADMIN_EMAIL: `seed-${randomUUID()}@anderp.test`,
        SEED_SUPERADMIN_PASSWORD: 'una clave inicial larga',
        SEED_SUPERADMIN_FIRST_NAME: 'Seed',
        SEED_SUPERADMIN_LAST_NAME: 'Admin',
      },
      hasher,
    );
    const types = (await as(t, s.orgA.admin.token).get('/catalogs/document-types').expect(200))
      .body as CatalogItem[];
    expect(types.map((d) => d.code)).toEqual(
      expect.arrayContaining(['CC', 'NIT', 'CE', 'PAS', 'TI', 'PPT']),
    );
    expect(
      (
        (await as(t, s.orgA.admin.token).get('/catalogs/account-types').expect(200))
          .body as CatalogItem[]
      ).map((a) => a.name),
    ).toEqual(expect.arrayContaining(['Ahorros', 'Corriente']));
    expect(
      ((await as(t, s.orgA.admin.token).get('/catalogs/banks').expect(200)).body as CatalogItem[])
        .length,
    ).toBeGreaterThanOrEqual(21);
    const categories = await db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.organizationId, organizationId));
    expect(categories).toHaveLength(7);
  });
});

describe('Categorías de egreso', () => {
  const list = async (token: string) =>
    (await as(t, token).get('/expense-categories').expect(200)).body as ExpenseCategory[];

  it('CA-7 lista las de la organización, ordenadas', async () => {
    const categories = await list(s.orgA.admin.token);
    expect(categories.map((c) => c.name)).toEqual([
      'Administrativo',
      'Honorarios',
      'Comercial',
      'Jurídico',
      'Tributario',
      'Nómina',
      'Gastos extras',
    ]);
  });

  it('CA-8 crear y renombrar; nombre único por organización pero repetible en otra', async () => {
    const created = (
      await as(t, s.orgA.admin.token)
        .post('/expense-categories', { name: 'Tecnología' })
        .expect(201)
    ).body as ExpenseCategory;
    expect(created).toMatchObject({ name: 'Tecnología', systemCode: null, sortOrder: 8 });

    const renamed = (
      await as(t, s.orgA.admin.token)
        .patch(`/expense-categories/${created.id}`, { name: 'Sistemas' })
        .expect(200)
    ).body as ExpenseCategory;
    expect(renamed.name).toBe('Sistemas');

    const dup = await as(t, s.orgA.admin.token)
      .post('/expense-categories', { name: 'Comercial' })
      .expect(409);
    expect(dup.body).toMatchObject({ code: 'DUPLICATE_NAME' });
    await as(t, s.orgB.admin.token).post('/expense-categories', { name: 'Sistemas' }).expect(201);
  });

  it('CA-9 reordena con la lista completa de ids', async () => {
    const categories = await list(s.orgA.admin.token);
    const reversed = [...categories].reverse().map((c) => c.id);
    const res = await as(t, s.orgA.admin.token)
      .put('/expense-categories/order', { ids: reversed })
      .expect(200);
    expect((res.body as ExpenseCategory[]).map((c) => c.id)).toEqual(reversed);

    const partial = await as(t, s.orgA.admin.token)
      .put('/expense-categories/order', { ids: reversed.slice(1) })
      .expect(422);
    expect(partial.body).toMatchObject({ code: 'INVALID_CATEGORY_ORDER' });
  });

  it('CA-10 la categoría "Honorarios" no se renombra, desactiva ni borra', async () => {
    const fees = (await list(s.orgA.admin.token)).find((c) => c.systemCode === 'FEES')!;
    for (const send of [
      () => as(t, s.orgA.admin.token).patch(`/expense-categories/${fees.id}`, { name: 'Otro' }),
      () => as(t, s.orgA.admin.token).patch(`/expense-categories/${fees.id}`, { isActive: false }),
      () => as(t, s.orgA.admin.token).delete(`/expense-categories/${fees.id}`),
    ]) {
      const res = await send().expect(422);
      expect(res.body).toMatchObject({ code: 'SYSTEM_CATEGORY_PROTECTED' });
    }
  });

  it('CA-17 las escrituras registran autor y el borrado es lógico', async () => {
    const created = (
      await as(t, s.orgA.admin.token).post('/expense-categories', { name: 'Temporal' }).expect(201)
    ).body as ExpenseCategory;
    await as(t, s.orgA.admin.token)
      .patch(`/expense-categories/${created.id}`, { isActive: false })
      .expect(200);
    await as(t, s.orgA.admin.token).delete(`/expense-categories/${created.id}`).expect(204);

    const [row] = await db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.id, created.id));
    expect(row).toMatchObject({
      organizationId: s.orgA.id,
      createdBy: s.orgA.admin.id,
      updatedBy: s.orgA.admin.id,
      deletedBy: s.orgA.admin.id,
    });
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect((await list(s.orgA.admin.token)).find((c) => c.id === created.id)).toBeUndefined();
  });
});

describe('Usuarios de la organización', () => {
  const members = async (token: string) =>
    (await as(t, token).get('/members').expect(200)).body as Member[];

  it('CA-11, CA-12 y CA-15 invitar, activar la cuenta y listar', async () => {
    const email = `nuevo-${randomUUID()}@empresa.co`;
    const invited = (
      await as(t, s.orgA.admin.token)
        .post('/members', { email, firstName: 'Pedro', lastName: 'Luna' })
        .expect(201)
    ).body as Member;
    expect(invited).toMatchObject({
      email,
      invitationPending: true,
      isActive: true,
      role: 'admin',
    });

    const dup = await as(t, s.orgA.admin.token)
      .post('/members', { email, firstName: 'P', lastName: 'L' })
      .expect(409);
    expect(dup.body).toMatchObject({ code: 'ALREADY_MEMBER' });

    const token = t.mailer.lastLinkTo(email).searchParams.get('token')!;
    await t.http
      .post('/api/v1/auth/password/reset')
      .send({ token, newPassword: 'mi clave de invitado' })
      .expect(204);
    await login(t, email, 'mi clave de invitado');

    const listed = (await members(s.orgA.admin.token)).find((m) => m.userId === invited.userId);
    expect(listed?.invitationPending).toBe(false);
  });

  it('CA-13 reenviar la invitación invalida la anterior; sin invitación pendiente → 422', async () => {
    const email = `nuevo-${randomUUID()}@empresa.co`;
    const invited = (
      await as(t, s.orgA.admin.token)
        .post('/members', { email, firstName: 'Pedro', lastName: 'Luna' })
        .expect(201)
    ).body as Member;
    const first = t.mailer.lastLinkTo(email).searchParams.get('token')!;
    await as(t, s.orgA.admin.token).post(`/members/${invited.userId}/resend-invite`).expect(204);
    const second = t.mailer.lastLinkTo(email).searchParams.get('token')!;
    expect(second).not.toBe(first);

    await t.http
      .post('/api/v1/auth/password/reset')
      .send({ token: first, newPassword: 'mi clave de invitado' })
      .expect(422);
    await t.http
      .post('/api/v1/auth/password/reset')
      .send({ token: second, newPassword: 'mi clave de invitado' })
      .expect(204);

    const res = await as(t, s.orgA.admin.token)
      .post(`/members/${invited.userId}/resend-invite`)
      .expect(422);
    expect(res.body).toMatchObject({ code: 'INVITE_NOT_PENDING' });
  });

  it('CA-20 invitar a otra organización reemplaza la invitación pendiente', async () => {
    const email = `nuevo-${randomUUID()}@empresa.co`;
    const person = { email, firstName: 'Pedro', lastName: 'Luna' };
    const invited = (await as(t, s.orgA.admin.token).post('/members', person).expect(201))
      .body as Member;
    const fromA = t.mailer.lastLinkTo(email).searchParams.get('token')!;
    await as(t, s.orgB.admin.token).post('/members', person).expect(201);
    const fromB = t.mailer.lastLinkTo(email).searchParams.get('token')!;

    expect((await members(s.orgA.admin.token)).some((m) => m.userId === invited.userId)).toBe(
      false,
    );
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, 'member.invitation_replaced'),
          eq(auditLogs.organizationId, s.orgA.id),
        ),
      );
    expect(audit?.entityId).toBe(invited.userId);

    await t.http
      .post('/api/v1/auth/password/reset')
      .send({ token: fromA, newPassword: 'mi clave de invitado' })
      .expect(422);
    await t.http
      .post('/api/v1/auth/password/reset')
      .send({ token: fromB, newPassword: 'mi clave de invitado' })
      .expect(204);
    const me = await as(t, await login(t, email, 'mi clave de invitado'))
      .get('/auth/me')
      .expect(200);
    expect(me.body).toMatchObject({ organization: { id: s.orgB.id } });
  });

  it('CA-14 desactivar revoca sus sesiones y le impide entrar; reactivar lo devuelve', async () => {
    const other = await createMember(t, db, s.orgA.id);
    const res = await as(t, s.orgA.admin.token)
      .patch(`/members/${other.id}`, { isActive: false })
      .expect(200);
    expect((res.body as Member).isActive).toBe(false);

    await as(t, other.token).get('/auth/me').expect(401);
    const denied = await t.http
      .post('/api/v1/auth/login')
      .send({ email: other.email, password: TEST_PASSWORD })
      .expect(403);
    expect(denied.body).toMatchObject({ code: 'ACCOUNT_DISABLED' });

    await as(t, s.orgA.admin.token).patch(`/members/${other.id}`, { isActive: true }).expect(200);
    await login(t, other.email);
  });

  it('CA-14 nadie se desactiva a sí mismo', async () => {
    const res = await as(t, s.orgA.admin.token)
      .patch(`/members/${s.orgA.admin.id}`, { isActive: false })
      .expect(422);
    expect(res.body).toMatchObject({ code: 'CANNOT_DEACTIVATE_SELF' });
  });

  it('CA-14 un admin no puede desactivar al super admin', async () => {
    const res = await as(t, s.orgA.admin.token)
      .patch(`/members/${s.superAdmin.id}`, { isActive: false })
      .expect(403);
    expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('CA-16 aislamiento entre organizaciones', () => {
  it('un admin de A no ve ni modifica categorías ni usuarios de B', async () => {
    const categoriesB = (await as(t, s.orgB.admin.token).get('/expense-categories').expect(200))
      .body as ExpenseCategory[];
    const categoryB = categoriesB[0]!;
    const categoriesA = (await as(t, s.orgA.admin.token).get('/expense-categories').expect(200))
      .body as ExpenseCategory[];
    expect(categoriesA.map((c) => c.id)).not.toContain(categoryB.id);

    await as(t, s.orgA.admin.token)
      .patch(`/expense-categories/${categoryB.id}`, { name: 'Hackeada' })
      .expect(404);
    await as(t, s.orgA.admin.token).delete(`/expense-categories/${categoryB.id}`).expect(404);

    const membersA = (await as(t, s.orgA.admin.token).get('/members').expect(200)).body as Member[];
    expect(membersA.map((m) => m.userId)).not.toContain(s.orgB.admin.id);
    await as(t, s.orgA.admin.token)
      .patch(`/members/${s.orgB.admin.id}`, { isActive: false })
      .expect(404);
    await as(t, s.orgA.admin.token).post(`/members/${s.orgB.admin.id}/resend-invite`).expect(404);

    const [membershipB] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, s.orgB.admin.id),
          eq(organizationMembers.organizationId, s.orgB.id),
        ),
      );
    expect(membershipB?.isActive).toBe(true);
  });

  it('un admin de A no puede reordenar con categorías de B', async () => {
    const idsA = (
      (await as(t, s.orgA.admin.token).get('/expense-categories').expect(200))
        .body as ExpenseCategory[]
    ).map((c) => c.id);
    const idsB = (
      (await as(t, s.orgB.admin.token).get('/expense-categories').expect(200))
        .body as ExpenseCategory[]
    ).map((c) => c.id);
    await as(t, s.orgA.admin.token)
      .put('/expense-categories/order', { ids: [...idsA.slice(1), idsB[0]] })
      .expect(422);
  });
});
