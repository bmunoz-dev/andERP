import type { AuthSessionResponse } from '@anderp/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { Response } from 'supertest';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import {
  auditLogs,
  expenseCategories,
  organizationMembers,
  organizations,
  sessions,
} from '../src/db/schema';
import '../src/modules/auth/auth.module'; // registra las restricciones
import { mapPostgresError } from '../src/shared/errors/pg-error.mapper';
import { createTestApp, type TestApp } from './setup/create-test-app';
import {
  as,
  createMember,
  createOrganization,
  TEST_PASSWORD,
  type TestOrganization,
  type TestUser,
} from './setup/fixtures';
import { resetDb, withOwnerSql } from './setup/reset-db';

type Sql = postgres.Sql | postgres.TransactionSql;

/** Selector de organización de F20 (design.md §5.3, §6.2). */
describe('F20 selector: base de datos', () => {
  beforeEach(resetDb);

  const insertOrg = (sql: Sql, status = 'active') =>
    sql<{ id: string }[]>`
      insert into anderp.organizations (id, name, tax_id, status)
      values (${randomUUID()}, 'Org', ${randomUUID().slice(0, 18)}, ${status}::anderp.organization_status)
      returning id`.then((r) => r[0]!.id);

  const insertUser = (sql: Sql) =>
    sql<{ id: string }[]>`
      insert into anderp.users (id, email, first_name, last_name)
      values (${randomUUID()}, ${`u-${randomUUID()}@x.co`}, 'Ana', 'Gómez') returning id`.then(
      (r) => r[0]!.id,
    );

  const insertMember = (
    sql: Sql,
    userId: string,
    organizationId: string,
    createdAt: string,
    extra: { active?: boolean } = {},
  ) =>
    sql`insert into anderp.organization_members
      (user_id, organization_id, role, is_active, created_at)
      values (${userId}, ${organizationId}, 'admin', ${extra.active ?? true}, ${createdAt})`;

  const insertSession = (sql: Sql, userId: string, organizationId: string | null) =>
    sql`insert into anderp.sessions (id, user_id, organization_id, family_id, token_hash, expires_at)
      values (${randomUUID()}, ${userId}, ${organizationId}, ${randomUUID()}, ${randomUUID()}, now() + interval '7 days')`;

  it('CA-1: la sesión solo admite una organización de la que el usuario es miembro', async () => {
    await withOwnerSql(async (sql) => {
      const [orgA, orgB, user] = [
        await insertOrg(sql),
        await insertOrg(sql),
        await insertUser(sql),
      ];
      await insertMember(sql, user, orgA, '2026-01-01');

      await insertSession(sql, user, orgA);
      const error = await insertSession(sql, user, orgB).catch((e: unknown) => e);
      expect(error).toMatchObject({ constraint_name: 'sessions_membership_fk' });
      expect(mapPostgresError(error)?.code).toBe('NOT_FOUND');
      await expect(insertSession(sql, user, null)).rejects.toThrow(/not-null/);
    });
  });

  it('CA-2: `last_selected_at` es nula hasta que el usuario elige', async () => {
    await withOwnerSql(async (sql) => {
      const [org, user] = [await insertOrg(sql), await insertUser(sql)];
      await insertMember(sql, user, org, '2026-01-01');
      const [row] = await sql<{ last_selected_at: Date | null }[]>`
        select last_selected_at from anderp.organization_members`;
      expect(row?.last_selected_at).toBeNull();
    });
  });

  it('CA-2: la migración rellena cada sesión con la membresía que usaban hoy', async () => {
    // La base de pruebas se migra vacía, así que se ejecuta el relleno de la migración a mano,
    // sobre sesiones sin organización (se quita el NOT NULL y la FK dentro de una transacción
    // que se revierte al final).
    const dir = path.resolve(__dirname, '../drizzle');
    const file = readdirSync(dir).find((f) => f.startsWith('0035_'));
    const backfill = /UPDATE anderp\.sessions[\s\S]*?DELETE FROM anderp\.sessions[^;]*;/i.exec(
      readFileSync(path.join(dir, file ?? ''), 'utf8'),
    )?.[0];
    expect(backfill).toBeDefined();

    const rollback = new Error('rollback');
    await withOwnerSql(async (sql) => {
      const [oldest, newest, suspended] = [
        await insertOrg(sql),
        await insertOrg(sql),
        await insertOrg(sql, 'suspended'),
      ];
      const [multi, inactiveOnly, orphan] = [
        await insertUser(sql),
        await insertUser(sql),
        await insertUser(sql),
      ];
      // `multi`: la más antigua activa es `oldest`; la inactiva más vieja no cuenta.
      await insertMember(sql, multi, newest, '2026-03-01');
      await insertMember(sql, multi, oldest, '2026-02-01');
      await insertMember(sql, multi, suspended, '2026-01-01', { active: false });
      // `inactiveOnly`: ninguna activa, toma la más antigua sin filtrar.
      await insertMember(sql, inactiveOnly, newest, '2026-03-01', { active: false });
      await insertMember(sql, inactiveOnly, oldest, '2026-02-01', { active: false });

      await sql
        .begin(async (tx) => {
          await tx`alter table anderp.sessions drop constraint sessions_membership_fk`;
          await tx`alter table anderp.sessions alter column organization_id drop not null`;
          await insertSession(tx, multi, null);
          await insertSession(tx, inactiveOnly, null);
          await insertSession(tx, orphan, null); // sin membresía: se borra
          await tx.unsafe(backfill ?? '');
          const rows = await tx<{ user_id: string; organization_id: string }[]>`
            select user_id, organization_id from anderp.sessions`;
          expect(rows).toHaveLength(2);
          expect(rows.find((r) => r.user_id === multi)?.organization_id).toBe(oldest);
          expect(rows.find((r) => r.user_id === inactiveOnly)?.organization_id).toBe(oldest);
          throw rollback;
        })
        .catch((error: unknown) => {
          if (error !== rollback) throw error;
        });
    });
  });
});

describe('F20 selector: API', () => {
  let t: TestApp;
  let db: Database;

  beforeAll(async () => {
    await resetDb();
    t = await createTestApp();
    db = t.app.get<Database>(DB);
  });

  afterAll(async () => {
    await t.close();
  });

  /** Usuario miembro de las organizaciones dadas; la primera es la más antigua. */
  async function userIn(orgs: TestOrganization[], options: { isSuperAdmin?: boolean } = {}) {
    const member = await createMember(t, db, orgs[0]!.id, options);
    for (const [i, org] of orgs.slice(1).entries()) {
      await db.insert(organizationMembers).values({
        userId: member.id,
        organizationId: org.id,
        role: 'admin',
        createdAt: new Date(Date.now() + (i + 1) * 1000),
      });
    }
    return member;
  }

  const newOrg = (name: string) => createOrganization(db, `${name} ${randomUUID().slice(0, 6)}`);

  const loginAs = (email: string) =>
    t.http.post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD });

  const cookieOf = (res: Response) => {
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    return cookies.find((c) => c.startsWith('anderp_rt='))!.split(';')[0]!;
  };

  const refresh = (cookie: string) => t.http.post('/api/v1/auth/refresh').set('Cookie', cookie);

  const setMembership = (
    userId: string,
    organizationId: string,
    values: Partial<typeof organizationMembers.$inferInsert>,
  ) =>
    db
      .update(organizationMembers)
      .set(values)
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.organizationId, organizationId),
        ),
      );

  const activeOrgOf = (res: Response) => (res.body as AuthSessionResponse).user.organization.id;

  describe('entrada, refresh y perfil', () => {
    let orgA: TestOrganization;
    let orgB: TestOrganization;
    let user: TestUser;

    beforeEach(async () => {
      [orgA, orgB] = [await newOrg('Bravo'), await newOrg('Alfa')];
      user = await userIn([orgA, orgB]);
      // `createMember` ya inició una sesión; las pruebas parten de cero.
      await db.delete(sessions).where(eq(sessions.userId, user.id));
    });

    it('CA-3 CA-4 entra en la más antigua, o en la última elegida, y no marca `last_selected_at`', async () => {
      expect(activeOrgOf(await loginAs(user.email))).toBe(orgA.id);
      const rows = await db
        .select({ at: organizationMembers.lastSelectedAt })
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, user.id));
      expect(rows.every((r) => r.at === null)).toBe(true);

      await setMembership(user.id, orgB.id, { lastSelectedAt: new Date() });
      expect(activeOrgOf(await loginAs(user.email))).toBe(orgB.id);
    });

    it('CA-3 una organización suspendida no se ofrece: entra en la siguiente activa', async () => {
      await db
        .update(organizations)
        .set({ status: 'suspended' })
        .where(eq(organizations.id, orgA.id));
      const res = await loginAs(user.email).expect(200);
      const profile = (res.body as AuthSessionResponse).user;
      expect(profile.organization.id).toBe(orgB.id);
      expect(profile.organizations.map((o) => o.id)).toEqual([orgB.id]);
    });

    it('CA-3 CA-5 sin ninguna disponible: 403 ACCOUNT_DISABLED; el super admin entra a la suspendida', async () => {
      const lone = await newOrg('Sola');
      const normal = await userIn([lone]);
      const root = await userIn([lone], { isSuperAdmin: true });
      await db
        .update(organizations)
        .set({ status: 'suspended' })
        .where(eq(organizations.id, lone.id));

      const res = await loginAs(normal.email).expect(403);
      expect((res.body as { code: string }).code).toBe('ACCOUNT_DISABLED');
      expect(activeOrgOf(await loginAs(root.email).expect(200))).toBe(lone.id);
    });

    it('CA-7 el perfil del login, el refresh y /auth/me lista las disponibles por nombre', async () => {
      const res = await loginAs(user.email).expect(200);
      const profile = (res.body as AuthSessionResponse).user;
      expect(profile.organizations).toEqual([
        { id: orgB.id, name: orgB.name },
        { id: orgA.id, name: orgA.name },
      ]);
      expect(profile.organization).toEqual({ id: orgA.id, name: orgA.name });

      const refreshed = await refresh(cookieOf(res)).expect(200);
      expect((refreshed.body as AuthSessionResponse).user).toEqual(profile);

      const me = await as(t, (res.body as AuthSessionResponse).accessToken)
        .get('/auth/me')
        .expect(200);
      expect(me.body).toEqual(profile);
    });

    it('CA-6 el refresh conserva la organización de la sesión y, si ya no está, cae a la de entrada', async () => {
      const res = await loginAs(user.email).expect(200);
      await db
        .update(sessions)
        .set({ organizationId: orgB.id })
        .where(eq(sessions.userId, user.id));

      const kept = await refresh(cookieOf(res)).expect(200);
      expect(activeOrgOf(kept)).toBe(orgB.id);

      await setMembership(user.id, orgB.id, { isActive: false });
      const fallen = await refresh(cookieOf(kept)).expect(200);
      expect(activeOrgOf(fallen)).toBe(orgA.id);
      const [row] = await db
        .select({ organizationId: sessions.organizationId })
        .from(sessions)
        .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
      expect(row?.organizationId).toBe(orgA.id);
    });

    it('CA-5 sin organizaciones disponibles el refresh responde ACCOUNT_DISABLED y revoca la familia', async () => {
      const res = await loginAs(user.email).expect(200);
      await setMembership(user.id, orgA.id, { isActive: false });
      await setMembership(user.id, orgB.id, { isActive: false });

      const failed = await refresh(cookieOf(res)).expect(401);
      expect((failed.body as { code: string }).code).toBe('ACCOUNT_DISABLED');
      const active = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
      expect(active).toHaveLength(0);
    });
  });

  describe('guard: token y organización de la sesión (CA-10)', () => {
    let orgA: TestOrganization;
    let orgB: TestOrganization;
    let user: TestUser;

    beforeEach(async () => {
      [orgA, orgB] = [await newOrg('Alfa'), await newOrg('Bravo')];
      user = await userIn([orgA, orgB]);
    });

    const moveSessionsTo = (organizationId: string) =>
      db.update(sessions).set({ organizationId }).where(eq(sessions.userId, user.id));

    const categoriesOf = async (organizationId: string) =>
      (
        await db
          .select({ name: expenseCategories.name })
          .from(expenseCategories)
          .where(eq(expenseCategories.organizationId, organizationId))
      ).map((c) => c.name);

    const expectCode = (res: Response, status: number, code: string) => {
      expect(res.status).toBe(status);
      expect((res.body as { code: string }).code).toBe(code);
    };

    it('un token de la organización de la sesión funciona', async () => {
      await as(t, user.token).get('/expense-categories').expect(200);
    });

    it('CA-10 si la sesión cambió de organización, el token viejo recibe 409 en cualquier ruta', async () => {
      await moveSessionsTo(orgB.id);
      expectCode(await as(t, user.token).get('/expense-categories'), 409, 'ORGANIZATION_CHANGED');
      expectCode(await as(t, user.token).get('/auth/me'), 409, 'ORGANIZATION_CHANGED');
    });

    it('CA-10 una escritura con el token viejo no se guarda', async () => {
      await moveSessionsTo(orgB.id);
      await as(t, user.token).post('/expense-categories', { name: 'Intrusa' }).expect(409);
      expect(await categoriesOf(orgA.id)).not.toContain('Intrusa');
      expect(await categoriesOf(orgB.id)).not.toContain('Intrusa');
    });

    it('CA-10 el actor se arma con la membresía de la organización de la sesión', async () => {
      const cookie = cookieOf(await loginAs(user.email).expect(200));
      await moveSessionsTo(orgB.id);
      const { accessToken } = (await refresh(cookie).expect(200)).body as AuthSessionResponse;

      await as(t, accessToken).post('/expense-categories', { name: 'Nueva B' }).expect(201);
      expect(await categoriesOf(orgB.id)).toContain('Nueva B');
      expect(await categoriesOf(orgA.id)).not.toContain('Nueva B');
    });

    it('CA-10 si desactivan al usuario en la organización de la sesión: 409 si le queda otra, 401 si no', async () => {
      await setMembership(user.id, orgA.id, { isActive: false });
      expectCode(await as(t, user.token).get('/auth/me'), 409, 'ORGANIZATION_CHANGED');

      await setMembership(user.id, orgB.id, { isActive: false });
      expectCode(await as(t, user.token).get('/auth/me'), 401, 'ACCOUNT_DISABLED');
    });
  });

  describe('cambio de organización (CA-8 a CA-12)', () => {
    let orgA: TestOrganization;
    let orgB: TestOrganization;
    let user: TestUser;
    let cookie: string;
    let token: string;

    beforeEach(async () => {
      [orgA, orgB] = [await newOrg('Alfa'), await newOrg('Bravo')];
      user = await userIn([orgA, orgB]);
      await db.delete(sessions).where(eq(sessions.userId, user.id));
      const res = await loginAs(user.email).expect(200);
      cookie = cookieOf(res);
      token = (res.body as AuthSessionResponse).accessToken;
    });

    const switchTo = (accessToken: string, organizationId: string) =>
      as(t, accessToken).post('/auth/organization', { organizationId });

    const auditOf = (action: string) =>
      db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.action, action), eq(auditLogs.userId, user.id)));

    const lastSelected = async (organizationId: string) => {
      const [row] = await db
        .select({ at: organizationMembers.lastSelectedAt })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, user.id),
            eq(organizationMembers.organizationId, organizationId),
          ),
        );
      return row?.at ?? null;
    };

    it('CA-8 cambia la organización de la sesión, marca `last_selected_at` y audita origen y destino', async () => {
      await switchTo(token, orgB.id).expect(204);

      const rows = await db.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(rows.every((r) => r.organizationId === orgB.id)).toBe(true);
      expect(await lastSelected(orgB.id)).not.toBeNull();
      expect(await lastSelected(orgA.id)).toBeNull();

      const [entry] = await auditOf('auth.organization_switch');
      expect(entry).toMatchObject({
        userId: user.id,
        organizationId: orgB.id,
        changes: { from: orgA.id, to: orgB.id },
      });
    });

    it('CA-8 el token viejo queda obsoleto y el refresh entrega el de la nueva organización', async () => {
      await switchTo(token, orgB.id).expect(204);

      const stale = await as(t, token).get('/auth/me');
      expect(stale.status).toBe(409);
      expect((stale.body as { code: string }).code).toBe('ORGANIZATION_CHANGED');
      // Una pestaña con el token viejo tampoco puede volver a cambiar.
      await switchTo(token, orgA.id).expect(409);

      const refreshed = await refresh(cookie).expect(200);
      expect(activeOrgOf(refreshed)).toBe(orgB.id);
      const me = await as(t, (refreshed.body as AuthSessionResponse).accessToken)
        .get('/auth/me')
        .expect(200);
      expect((me.body as AuthSessionResponse['user']).organization.id).toBe(orgB.id);
    });

    it('CA-8 el próximo login entra en la organización elegida', async () => {
      await switchTo(token, orgB.id).expect(204);
      expect(activeOrgOf(await loginAs(user.email).expect(200))).toBe(orgB.id);
    });

    it('CA-9 elegir la organización activa responde 204 sin escribir ni auditar', async () => {
      await switchTo(token, orgA.id).expect(204);
      expect(await lastSelected(orgA.id)).toBeNull();
      expect(await auditOf('auth.organization_switch')).toHaveLength(0);
    });

    it('CA-9 una organización no disponible responde 404 y no cambia ni audita nada', async () => {
      const stranger = await newOrg('Ajena');
      const suspended = await newOrg('Suspendida');
      const deleted = await newOrg('Borrada');
      const inactive = await newOrg('Inactiva');
      for (const org of [suspended, deleted, inactive]) {
        await db.insert(organizationMembers).values({
          userId: user.id,
          organizationId: org.id,
          role: 'admin',
          isActive: org !== inactive,
        });
      }
      await db
        .update(organizations)
        .set({ status: 'suspended' })
        .where(eq(organizations.id, suspended.id));
      await db
        .update(organizations)
        .set({ deletedAt: new Date() })
        .where(eq(organizations.id, deleted.id));

      for (const id of [stranger.id, suspended.id, deleted.id, inactive.id, randomUUID()]) {
        const res = await switchTo(token, id);
        expect(res.status).toBe(404);
        expect((res.body as { code: string }).code).toBe('NOT_FOUND');
      }
      const rows = await db.select().from(sessions).where(eq(sessions.userId, user.id));
      expect(rows.every((r) => r.organizationId === orgA.id)).toBe(true);
      expect(await auditOf('auth.organization_switch')).toHaveLength(0);
    });

    it('CA-9 un cuerpo inválido → 422 VALIDATION_ERROR', async () => {
      const res = await switchTo(token, 'no-es-uuid');
      expect(res.status).toBe(422);
      expect((res.body as { code: string }).code).toBe('VALIDATION_ERROR');
    });

    it('CA-3 el super admin sí puede elegir una organización suspendida de la que es miembro', async () => {
      const root = await userIn([orgA, orgB], { isSuperAdmin: true });
      await db
        .update(organizations)
        .set({ status: 'suspended' })
        .where(eq(organizations.id, orgB.id));
      await switchTo(root.token, orgB.id).expect(204);
    });

    it('CA-11 dos sesiones del mismo usuario son independientes', async () => {
      const other = await loginAs(user.email).expect(200);
      const otherToken = (other.body as AuthSessionResponse).accessToken;

      await switchTo(token, orgB.id).expect(204);

      await as(t, otherToken).get('/auth/me').expect(200);
      expect(activeOrgOf(await refresh(cookieOf(other)).expect(200))).toBe(orgA.id);
      expect(activeOrgOf(await refresh(cookie).expect(200))).toBe(orgB.id);
    });

    it('CA-12 después de cambiar de A a B, el usuario no ve ni toca datos de A', async () => {
      const [category] = await db
        .select()
        .from(expenseCategories)
        .where(eq(expenseCategories.organizationId, orgA.id));
      await switchTo(token, orgB.id).expect(204);
      const { accessToken } = (await refresh(cookie).expect(200)).body as AuthSessionResponse;

      const list = await as(t, accessToken).get('/expense-categories').expect(200);
      expect((list.body as { id: string }[]).map((c) => c.id)).not.toContain(category!.id);
      await as(t, accessToken)
        .patch(`/expense-categories/${category!.id}`, { name: 'Robada' })
        .expect(404);
    });
  });
});
