import type { AuthSessionResponse } from '@anderp/shared';
import { JwtService } from '@nestjs/jwt';
import { hash } from '@node-rs/argon2';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import {
  auditLogs,
  organizationMembers,
  organizations,
  passwordResets,
  users,
} from '../src/db/schema';
import { seed } from '../src/db/seed';
import { Argon2PasswordHasher } from '../src/modules/auth/infrastructure/argon2-password-hasher';
import { createTestApp, type TestApp } from './setup/create-test-app';
import { resetDb, withRuntimeSql } from './setup/reset-db';

const PASSWORD = 'correct horse battery staple';
const hasher = new Argon2PasswordHasher();

let t: TestApp;
let db: Database;

interface UserOptions {
  password?: string;
  isSuperAdmin?: boolean;
  status?: 'active' | 'inactive';
  organizationStatus?: 'active' | 'suspended';
  passwordHash?: string;
}

async function createUser(options: UserOptions = {}) {
  const email = `user-${randomUUID()}@empresa.co`;
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Empresa de prueba',
      taxId: randomUUID().slice(0, 20),
      status: options.organizationStatus ?? 'active',
    })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash: options.passwordHash ?? (await hasher.hash(options.password ?? PASSWORD)),
      firstName: 'Ana',
      lastName: 'Gómez',
      isSuperAdmin: options.isSuperAdmin ?? false,
      status: options.status ?? 'active',
    })
    .returning();
  await db
    .insert(organizationMembers)
    .values({ userId: user!.id, organizationId: org!.id, role: 'admin' });
  return { email, userId: user!.id, organizationId: org!.id };
}

function login(email: string, password = PASSWORD) {
  return t.http.post('/api/v1/auth/login').send({ email, password });
}

function refreshCookieOf(res: Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith('anderp_rt='));
  if (!cookie) throw new Error('No refresh cookie in response');
  return cookie.split(';')[0]!;
}

function refresh(cookie: string) {
  return t.http.post('/api/v1/auth/refresh').set('Cookie', cookie);
}

function me(accessToken: string) {
  return t.http.get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
}

async function auditActions(userId: string): Promise<string[]> {
  const rows = await db
    .select({ action: auditLogs.action })
    .from(auditLogs)
    .where(eq(auditLogs.userId, userId));
  return rows.map((r) => r.action);
}

beforeAll(async () => {
  await resetDb();
  t = await createTestApp();
  db = t.app.get<Database>(DB);
});

afterAll(async () => {
  await t.close();
});

describe('Login', () => {
  it('CA-1 devuelve access token y perfil, y fija la cookie del refresh token', async () => {
    const u = await createUser();
    const res = await login(u.email.toUpperCase()).expect(200);
    const body = res.body as AuthSessionResponse;

    expect(body.accessToken).toMatch(/^eyJ/);
    expect(body.user).toEqual({
      id: u.userId,
      email: u.email,
      firstName: 'Ana',
      lastName: 'Gómez',
      isSuperAdmin: false,
      organization: { id: u.organizationId, name: 'Empresa de prueba' },
      role: 'admin',
    });
    expect(res.headers['cache-control']).toBe('no-store');

    const cookie = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('anderp_rt='))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    const expires = new Date(/Expires=([^;]+)/.exec(cookie)![1]!).getTime();
    expect(expires - Date.now()).toBeGreaterThan(6.9 * 24 * 3600 * 1000);
  });

  it('CA-2 contraseña incorrecta y email inexistente dan la misma respuesta', async () => {
    const u = await createUser();
    const wrong = await login(u.email, 'wrong password').expect(401);
    const unknown = await login('nadie@empresa.co', 'wrong password').expect(401);
    const strip = (b: Record<string, unknown>) => ({ ...b, requestId: undefined });
    expect(strip(wrong.body as Record<string, unknown>)).toEqual(
      strip(unknown.body as Record<string, unknown>),
    );
    expect(wrong.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(await auditActions(u.userId)).toEqual(['auth.login_failed']);
  });

  it('CA-3 bloquea tras 5 fallos aunque la clave sea correcta, y se desbloquea al vencer', async () => {
    const u = await createUser();
    for (let i = 0; i < 5; i++) await login(u.email, 'wrong password').expect(401);
    const locked = await login(u.email).expect(423);
    expect(locked.body).toMatchObject({ code: 'ACCOUNT_LOCKED' });
    expect(await auditActions(u.userId)).toContain('auth.account_locked');

    await db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(users.id, u.userId));
    await login(u.email).expect(200);
  });

  it.each([
    ['usuario inactivo', { status: 'inactive' as const }],
    ['organización suspendida', { organizationStatus: 'suspended' as const }],
  ])('CA-4 %s → 403 ACCOUNT_DISABLED', async (_label, options) => {
    const u = await createUser(options);
    const res = await login(u.email).expect(403);
    expect(res.body).toMatchObject({ code: 'ACCOUNT_DISABLED' });
  });

  it('CA-4 el super admin entra aunque su organización esté suspendida', async () => {
    const u = await createUser({ isSuperAdmin: true, organizationStatus: 'suspended' });
    const res = await login(u.email).expect(200);
    expect((res.body as AuthSessionResponse).user.isSuperAdmin).toBe(true);
  });

  it('CA-6 registra last_login_at y vuelve a hashear con parámetros antiguos', async () => {
    const weak = await hash(PASSWORD, { memoryCost: 4096, timeCost: 1, parallelism: 1 });
    const u = await createUser({ passwordHash: weak });
    await login(u.email).expect(200);
    const [row] = await db.select().from(users).where(eq(users.id, u.userId));
    expect(row?.lastLoginAt).toBeInstanceOf(Date);
    expect(row?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await auditActions(u.userId)).toContain('auth.login');
  });
});

describe('CA-5 límite de peticiones', () => {
  it('más de N intentos por minuto → 429 TOO_MANY_REQUESTS', async () => {
    const limited = await createTestApp({ env: { AUTH_THROTTLE_LIMIT: '3' } });
    try {
      for (let i = 0; i < 3; i++) {
        await limited.http
          .post('/api/v1/auth/login')
          .send({ email: 'x@y.co', password: 'nope' })
          .expect(401);
      }
      const res = await limited.http
        .post('/api/v1/auth/login')
        .send({ email: 'x@y.co', password: 'nope' })
        .expect(429);
      expect(res.body).toMatchObject({ code: 'TOO_MANY_REQUESTS' });

      for (let i = 0; i < 3; i++) {
        await limited.http
          .post('/api/v1/auth/password/forgot')
          .send({ email: 'x@y.co' })
          .expect(202);
      }
      await limited.http.post('/api/v1/auth/password/forgot').send({ email: 'x@y.co' }).expect(429);
    } finally {
      await limited.close();
    }
  });
});

describe('Sesión', () => {
  it('CA-7 refresh rota la cookie y entrega un access token nuevo', async () => {
    const u = await createUser();
    const first = refreshCookieOf(await login(u.email).expect(200));
    const res = await refresh(first).expect(200);
    const second = refreshCookieOf(res);
    expect(second).not.toBe(first);
    await me((res.body as AuthSessionResponse).accessToken).expect(200);
  });

  it('CA-8 reutilizar un refresh token rotado revoca toda la familia', async () => {
    const u = await createUser();
    const first = refreshCookieOf(await login(u.email).expect(200));
    const rotatedRes = await refresh(first).expect(200);
    const rotated = refreshCookieOf(rotatedRes);

    const reuse = await refresh(first).expect(401);
    expect(reuse.body).toMatchObject({ code: 'SESSION_REVOKED' });
    await refresh(rotated).expect(401);
    // El access token de esa familia también deja de servir.
    await me((rotatedRes.body as AuthSessionResponse).accessToken).expect(401);
    expect(await auditActions(u.userId)).toContain('auth.session_reuse_detected');
  });

  it('CA-9 access token vencido → 401 TOKEN_EXPIRED', async () => {
    const u = await createUser();
    const res = await login(u.email).expect(200);
    const claims = t.app
      .get(JwtService)
      .decode<Record<string, unknown>>((res.body as AuthSessionResponse).accessToken);
    const expired = await t.app
      .get(JwtService)
      .signAsync(
        { sub: claims.sub, org: claims.org, role: claims.role, sa: claims.sa, sid: claims.sid },
        { expiresIn: -60 },
      );
    const out = await me(expired).expect(401);
    expect(out.body).toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it('CA-10 logout revoca la sesión, borra la cookie e invalida el access token', async () => {
    const u = await createUser();
    const res = await login(u.email).expect(200);
    const cookie = refreshCookieOf(res);

    const out = await t.http.post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
    expect(([] as string[]).concat(out.headers['set-cookie'] ?? []).join()).toMatch(
      /anderp_rt=;.*Expires=Thu, 01 Jan 1970/,
    );
    await refresh(cookie).expect(401);
    const after = await me((res.body as AuthSessionResponse).accessToken).expect(401);
    expect(after.body).toMatchObject({ code: 'SESSION_REVOKED' });
    // Sin cookie también responde 204.
    await t.http.post('/api/v1/auth/logout').expect(204);
  });

  it('CA-11 sin token → 401 UNAUTHORIZED; token inválido → 401', async () => {
    const none = await t.http.get('/api/v1/auth/me').expect(401);
    expect(none.body).toMatchObject({ code: 'UNAUTHORIZED' });
    await me('not-a-jwt').expect(401);
  });

  it('CA-11 un usuario desactivado después del login → 401 ACCOUNT_DISABLED', async () => {
    const u = await createUser();
    const token = ((await login(u.email).expect(200)).body as AuthSessionResponse).accessToken;
    await db.update(users).set({ status: 'inactive' }).where(eq(users.id, u.userId));
    const res = await me(token).expect(401);
    expect(res.body).toMatchObject({ code: 'ACCOUNT_DISABLED' });
  });

  it('CA-12 /auth/me devuelve el mismo perfil que el login', async () => {
    const u = await createUser();
    const res = await login(u.email).expect(200);
    const body = res.body as AuthSessionResponse;
    const profile = await me(body.accessToken).expect(200);
    expect(profile.body).toEqual(body.user);
  });
});

describe('Contraseñas', () => {
  it('CA-13 cambiar contraseña: valida, cierra las demás sesiones y conserva la actual', async () => {
    const u = await createUser();
    const current = await login(u.email).expect(200);
    const other = refreshCookieOf(await login(u.email).expect(200));
    const token = (current.body as AuthSessionResponse).accessToken;
    const change = (body: object) =>
      t.http
        .post('/api/v1/auth/password/change')
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    expect(
      (await change({ currentPassword: 'nope', newPassword: 'una clave nueva larga' }).expect(422))
        .body,
    ).toMatchObject({ code: 'INVALID_CURRENT_PASSWORD' });
    expect(
      (await change({ currentPassword: PASSWORD, newPassword: 'password1234' }).expect(422)).body,
    ).toMatchObject({ code: 'WEAK_PASSWORD' });
    expect(
      (await change({ currentPassword: PASSWORD, newPassword: 'corta' }).expect(422)).body,
    ).toMatchObject({ code: 'VALIDATION_ERROR' });

    await change({ currentPassword: PASSWORD, newPassword: 'una clave nueva larga' }).expect(204);
    await refresh(other).expect(401);
    await me(token).expect(200);
    await login(u.email, 'una clave nueva larga').expect(200);
    expect(await auditActions(u.userId)).toContain('auth.password_changed');
  });

  it('CA-14 olvidé mi contraseña: 202 siempre; correo solo si el usuario existe', async () => {
    const u = await createUser();
    t.mailer.sent = [];
    await t.http
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'nadie@empresa.co' })
      .expect(202);
    expect(t.mailer.sent).toHaveLength(0);

    await t.http.post('/api/v1/auth/password/forgot').send({ email: u.email }).expect(202);
    expect(t.mailer.sent).toHaveLength(1);
    expect(t.mailer.sent[0]!.to).toBe(u.email);
    expect(t.mailer.sent[0]!.text).toMatch(/http:\/\/localhost:5173\/restablecer\?token=[\w-]+/);
    expect(await auditActions(u.userId)).toContain('auth.password_reset_requested');
  });

  it('CA-15 restablecer: cambia la clave, gasta el token y cierra todas las sesiones', async () => {
    const u = await createUser();
    const session = refreshCookieOf(await login(u.email).expect(200));
    t.mailer.sent = [];
    await t.http.post('/api/v1/auth/password/forgot').send({ email: u.email }).expect(202);
    const token = new URL(/http\S+/.exec(t.mailer.sent[0]!.text)![0]).searchParams.get('token')!;

    await t.http
      .post('/api/v1/auth/password/reset')
      .send({ token, newPassword: 'clave restablecida larga' })
      .expect(204);
    await refresh(session).expect(401);
    await login(u.email, 'clave restablecida larga').expect(200);

    const again = await t.http
      .post('/api/v1/auth/password/reset')
      .send({ token, newPassword: 'otra clave distinta' })
      .expect(422);
    expect(again.body).toMatchObject({ code: 'INVALID_RESET_TOKEN' });
    expect(await auditActions(u.userId)).toContain('auth.password_reset');
  });

  it('CA-15 un token vencido o inexistente → 422 INVALID_RESET_TOKEN', async () => {
    const u = await createUser();
    t.mailer.sent = [];
    await t.http.post('/api/v1/auth/password/forgot').send({ email: u.email }).expect(202);
    const token = new URL(/http\S+/.exec(t.mailer.sent[0]!.text)![0]).searchParams.get('token')!;
    await db
      .update(passwordResets)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(and(eq(passwordResets.userId, u.userId)));

    await t.http
      .post('/api/v1/auth/password/reset')
      .send({ token, newPassword: 'clave restablecida larga' })
      .expect(422);
    await t.http
      .post('/api/v1/auth/password/reset')
      .send({ token: 'nope', newPassword: 'clave restablecida larga' })
      .expect(422);
  });
});

describe('Instalación, auditoría y secretos', () => {
  it('CA-16 el seed es idempotente', async () => {
    const input = {
      SEED_ORG_NAME: 'Organización inicial',
      SEED_ORG_TAX_ID: '900123456-7',
      SEED_SUPERADMIN_EMAIL: 'root@anderp.test',
      SEED_SUPERADMIN_PASSWORD: 'una clave inicial larga',
      SEED_SUPERADMIN_FIRST_NAME: 'Root',
      SEED_SUPERADMIN_LAST_NAME: 'Admin',
    };
    const first = await seed(db, input, hasher);
    const second = await seed(db, input, hasher);
    expect(second).toEqual(first);

    const rows = await db.select().from(users).where(eq(users.email, 'root@anderp.test'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isSuperAdmin).toBe(true);
    const res = await login('root@anderp.test', 'una clave inicial larga').expect(200);
    expect((res.body as AuthSessionResponse).user.organization.id).toBe(first.organizationId);
  });

  it('CA-17 la auditoría guarda IP y user agent; app_runtime no puede alterarla', async () => {
    const u = await createUser();
    await login(u.email).set('User-Agent', 'anderp-test-agent').expect(200);
    const [row] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.userId, u.userId), eq(auditLogs.action, 'auth.login')));
    expect(row).toMatchObject({ userAgent: 'anderp-test-agent', organizationId: u.organizationId });
    expect(row?.ip).toMatch(/127\.0\.0\.1|::1/);

    await withRuntimeSql(async (sql) => {
      await expect(sql`update anderp.audit_logs set action = 'x'`).rejects.toThrow(
        /permission denied/,
      );
      await expect(sql`delete from anderp.audit_logs`).rejects.toThrow(/permission denied/);
      await expect(sql`truncate anderp.audit_logs`).rejects.toThrow(/permission denied/);
    });
  });

  it('CA-18 ni las respuestas ni los logs contienen contraseñas, hashes ni refresh tokens', async () => {
    const u = await createUser({ password: 'secreto-muy-particular-123' });
    const res = await login(u.email, 'secreto-muy-particular-123').expect(200);
    const refreshToken = refreshCookieOf(res).split('=')[1]!;
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/passwordHash|argon2|secreto-muy-particular/);
    expect(body).not.toContain(refreshToken);

    const logs = t.logs.join('\n');
    expect(logs).not.toContain('secreto-muy-particular-123');
    expect(logs).not.toContain(refreshToken);
    expect(logs).not.toContain((res.body as AuthSessionResponse).accessToken);
  });
});
