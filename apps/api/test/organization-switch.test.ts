import type { AuthSessionResponse } from '@anderp/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { Response } from 'supertest';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import { organizationMembers, organizations, sessions } from '../src/db/schema';
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
});
