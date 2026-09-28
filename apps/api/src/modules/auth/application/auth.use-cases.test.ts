import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../../../config/env';
import type { Actor } from '../../../shared/context/request-context';
import { LOCK_DURATION_MS } from '../domain/login-attempts';
import { LoginUseCase } from './login.use-case';
import {
  ChangePasswordUseCase,
  PASSWORD_RESET_TTL_MINUTES,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
} from './password.use-cases';
import { REFRESH_TOKEN_TTL_MS, SessionIssuer } from './session-issuer';
import { LogoutUseCase, RefreshSessionUseCase } from './session.use-cases';
import {
  FakeAccessTokens,
  FakeAudit,
  FakeClock,
  FakeHasher,
  FakeMailer,
  FakeTokens,
  InMemoryResets,
  InMemorySessions,
  InMemoryUsers,
} from './testing/in-memory-auth';

const PASSWORD = 'correct horse battery';
const meta = { ip: '10.0.0.1', userAgent: 'vitest' };

function setup() {
  const clock = new FakeClock();
  const users = new InMemoryUsers();
  const sessions = new InMemorySessions();
  const resets = new InMemoryResets();
  const hasher = new FakeHasher();
  const tokens = new FakeTokens();
  const accessTokens = new FakeAccessTokens();
  const audit = new FakeAudit();
  const mailer = new FakeMailer();
  const common = { list: new Set(['password1234']) };
  const env = { WEB_URL: 'http://localhost:5173' } as Env;
  const issuer = new SessionIssuer(sessions, accessTokens, tokens, clock);

  return {
    clock,
    users,
    sessions,
    resets,
    hasher,
    audit,
    mailer,
    accessTokens,
    login: new LoginUseCase(users, hasher, clock, audit, issuer),
    refresh: new RefreshSessionUseCase(users, sessions, tokens, clock, audit, issuer),
    logout: new LogoutUseCase(sessions, tokens, clock, audit),
    changePassword: new ChangePasswordUseCase(users, sessions, hasher, common, clock, audit),
    requestReset: new RequestPasswordResetUseCase(users, resets, tokens, clock, audit, mailer, env),
    reset: new ResetPasswordUseCase(users, sessions, resets, hasher, tokens, common, clock, audit),
  };
}

type Ctx = ReturnType<typeof setup>;

async function expectCode(promise: Promise<unknown>, code: string, status: number) {
  await expect(promise).rejects.toMatchObject({ code, status });
}

describe('LoginUseCase', () => {
  let t: Ctx;
  beforeEach(() => {
    t = setup();
  });

  it('CA-1 emite access token, refresh token de 7 días y perfil', async () => {
    const user = t.users.add({ email: 'ana@empresa.co' }, {});
    const result = await t.login.execute({ email: 'ANA@empresa.co', password: PASSWORD }, meta);

    expect(result.user).toMatchObject({
      id: user.id,
      email: 'ana@empresa.co',
      organization: { id: 'org-1', name: 'Empresa' },
      role: 'admin',
      isSuperAdmin: false,
    });
    expect(result.refreshExpiresAt.getTime()).toBe(t.clock.now().getTime() + REFRESH_TOKEN_TTL_MS);
    expect(t.accessTokens.issued[0]).toMatchObject({ sub: user.id, org: 'org-1', sa: false });
    expect(t.sessions.active()).toHaveLength(1);
    expect(t.audit.actions()).toEqual(['auth.login']);
  });

  it('CA-2 contraseña incorrecta y email inexistente responden igual', async () => {
    t.users.add({ email: 'ana@empresa.co' }, {});
    await expectCode(
      t.login.execute({ email: 'ana@empresa.co', password: 'nope' }, meta),
      'INVALID_CREDENTIALS',
      401,
    );
    await expectCode(
      t.login.execute({ email: 'nadie@empresa.co', password: 'nope' }, meta),
      'INVALID_CREDENTIALS',
      401,
    );
    expect(t.hasher.dummyVerifications).toBe(1);
    expect(t.audit.actions()).toEqual(['auth.login_failed', 'auth.login_failed']);
  });

  it('un usuario con invitación pendiente (sin contraseña) no puede entrar', async () => {
    t.users.add({ email: 'nuevo@empresa.co', passwordHash: null }, {});
    await expectCode(
      t.login.execute({ email: 'nuevo@empresa.co', password: PASSWORD }, meta),
      'INVALID_CREDENTIALS',
      401,
    );
  });

  it('CA-3 bloquea tras 5 fallos, incluso con la contraseña correcta, y desbloquea a los 15 min', async () => {
    t.users.add({ email: 'ana@empresa.co' }, {});
    for (let i = 0; i < 5; i++) {
      await expectCode(
        t.login.execute({ email: 'ana@empresa.co', password: 'nope' }, meta),
        'INVALID_CREDENTIALS',
        401,
      );
    }
    expect(t.audit.actions()).toContain('auth.account_locked');

    await expectCode(
      t.login.execute({ email: 'ana@empresa.co', password: PASSWORD }, meta),
      'ACCOUNT_LOCKED',
      423,
    );

    t.clock.advance(LOCK_DURATION_MS);
    await expect(
      t.login.execute({ email: 'ana@empresa.co', password: PASSWORD }, meta),
    ).resolves.toBeDefined();
  });

  it('un login exitoso reinicia el contador de fallos', async () => {
    const user = t.users.add({ email: 'ana@empresa.co' }, {});
    for (let i = 0; i < 4; i++) {
      await t.login
        .execute({ email: 'ana@empresa.co', password: 'nope' }, meta)
        .catch(() => undefined);
    }
    await t.login.execute({ email: 'ana@empresa.co', password: PASSWORD }, meta);
    expect(t.users.users.get(user.id)?.failedLoginAttempts).toBe(0);
  });

  it.each([
    ['usuario inactivo', { status: 'inactive' as const }, {}],
    ['sin membresía', {}, undefined],
    ['organización suspendida', {}, { organizationStatus: 'suspended' as const }],
  ])('CA-4 %s → 403 ACCOUNT_DISABLED', async (_label, user, membership) => {
    t.users.add({ email: 'ana@empresa.co', ...user }, membership);
    await expectCode(
      t.login.execute({ email: 'ana@empresa.co', password: PASSWORD }, meta),
      'ACCOUNT_DISABLED',
      403,
    );
  });

  it('CA-4 el super admin entra aunque su organización esté suspendida', async () => {
    t.users.add(
      { email: 'root@empresa.co', isSuperAdmin: true },
      { organizationStatus: 'suspended' },
    );
    const result = await t.login.execute({ email: 'root@empresa.co', password: PASSWORD }, meta);
    expect(result.user.isSuperAdmin).toBe(true);
  });

  it('CA-6 vuelve a hashear si los parámetros guardados son antiguos', async () => {
    const user = t.users.add({ email: 'ana@empresa.co', passwordHash: `old:${PASSWORD}` }, {});
    await t.login.execute({ email: 'ana@empresa.co', password: PASSWORD }, meta);
    expect(t.users.users.get(user.id)?.passwordHash).toBe(`hashed:${PASSWORD}`);
  });
});

describe('RefreshSessionUseCase y LogoutUseCase', () => {
  let t: Ctx;
  let refreshToken: string;
  beforeEach(async () => {
    t = setup();
    t.users.add({ email: 'ana@empresa.co' }, {});
    ({ refreshToken } = await t.login.execute(
      { email: 'ana@empresa.co', password: PASSWORD },
      meta,
    ));
  });

  it('CA-7 rota el token dentro de la misma familia', async () => {
    const rotated = await t.refresh.execute(refreshToken, meta);
    expect(rotated.refreshToken).not.toBe(refreshToken);
    expect(t.sessions.active()).toHaveLength(1);
    expect(new Set(t.sessions.rows.map((r) => r.familyId)).size).toBe(1);
  });

  it('CA-8 reutilizar un token rotado revoca toda la familia', async () => {
    const rotated = await t.refresh.execute(refreshToken, meta);
    await expectCode(t.refresh.execute(refreshToken, meta), 'SESSION_REVOKED', 401);
    await expectCode(t.refresh.execute(rotated.refreshToken, meta), 'SESSION_REVOKED', 401);
    expect(t.sessions.active()).toHaveLength(0);
    expect(t.audit.actions()).toContain('auth.session_reuse_detected');
  });

  it('rechaza un token desconocido, ausente o vencido', async () => {
    await expectCode(t.refresh.execute('unknown', meta), 'SESSION_REVOKED', 401);
    await expectCode(t.refresh.execute(undefined, meta), 'SESSION_REVOKED', 401);
    t.clock.advance(REFRESH_TOKEN_TTL_MS);
    await expectCode(t.refresh.execute(refreshToken, meta), 'SESSION_REVOKED', 401);
  });

  it('un usuario desactivado no puede refrescar y su familia se revoca', async () => {
    const [user] = [...t.users.users.values()];
    t.users.users.set(user!.id, { ...user!, status: 'inactive' });
    await expectCode(t.refresh.execute(refreshToken, meta), 'ACCOUNT_DISABLED', 401);
    expect(t.sessions.active()).toHaveLength(0);
  });

  it('CA-10 logout revoca la sesión y es idempotente', async () => {
    await t.logout.execute(refreshToken);
    await t.logout.execute(refreshToken);
    await t.logout.execute(undefined);
    expect(t.sessions.active()).toHaveLength(0);
    expect(t.audit.actions().filter((a) => a === 'auth.logout')).toHaveLength(1);
  });
});

describe('Contraseñas', () => {
  let t: Ctx;
  let actor: Actor;
  beforeEach(async () => {
    t = setup();
    const user = t.users.add({ email: 'ana@empresa.co' }, {});
    await t.login.execute({ email: 'ana@empresa.co', password: PASSWORD }, meta);
    await t.login.execute({ email: 'ana@empresa.co', password: PASSWORD }, meta);
    actor = {
      userId: user.id,
      organizationId: 'org-1',
      role: 'admin',
      isSuperAdmin: false,
      sessionFamilyId: t.sessions.rows[0]!.familyId,
    };
  });

  describe('CA-13 cambiar contraseña', () => {
    it('exige la contraseña actual', async () => {
      await expectCode(
        t.changePassword.execute(actor, {
          currentPassword: 'nope',
          newPassword: 'otra clave larga',
        }),
        'INVALID_CURRENT_PASSWORD',
        422,
      );
    });

    it('aplica la política', async () => {
      await expectCode(
        t.changePassword.execute(actor, { currentPassword: PASSWORD, newPassword: 'password1234' }),
        'WEAK_PASSWORD',
        422,
      );
    });

    it('cambia el hash y revoca las demás sesiones, no la actual', async () => {
      await t.changePassword.execute(actor, {
        currentPassword: PASSWORD,
        newPassword: 'otra clave larga',
      });
      expect(t.users.users.get(actor.userId)?.passwordHash).toBe('hashed:otra clave larga');
      expect(t.sessions.active().map((s) => s.familyId)).toEqual([actor.sessionFamilyId]);
      expect(t.audit.actions()).toContain('auth.password_changed');
    });
  });

  describe('CA-14 / CA-15 recuperar contraseña', () => {
    async function requestToken(): Promise<string> {
      await t.requestReset.execute('ana@empresa.co');
      const link = new URL(/http\S+/.exec(t.mailer.sent.at(-1)!.text)![0]);
      return link.searchParams.get('token')!;
    }

    it('con un email desconocido no hace nada', async () => {
      await t.requestReset.execute('nadie@empresa.co');
      expect(t.resets.rows).toHaveLength(0);
      expect(t.mailer.sent).toHaveLength(0);
    });

    it('envía un enlace que vence en 30 minutos e invalida los anteriores', async () => {
      const first = await requestToken();
      const second = await requestToken();
      expect(t.mailer.sent[0]!.to).toBe('ana@empresa.co');
      expect(t.resets.rows[1]!.expiresAt.getTime()).toBe(
        t.clock.now().getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000,
      );
      await expectCode(
        t.reset.execute({ token: first, newPassword: 'nueva clave larga' }),
        'INVALID_RESET_TOKEN',
        422,
      );
      await t.reset.execute({ token: second, newPassword: 'nueva clave larga' });
    });

    it('cambia la contraseña, gasta el token y revoca todas las sesiones', async () => {
      const token = await requestToken();
      await t.reset.execute({ token, newPassword: 'nueva clave larga' });
      expect(t.users.users.get(actor.userId)?.passwordHash).toBe('hashed:nueva clave larga');
      expect(t.sessions.active()).toHaveLength(0);
      await expectCode(
        t.reset.execute({ token, newPassword: 'otra clave larga' }),
        'INVALID_RESET_TOKEN',
        422,
      );
    });

    it('un token vencido no sirve', async () => {
      const token = await requestToken();
      t.clock.advance(PASSWORD_RESET_TTL_MINUTES * 60_000);
      await expectCode(
        t.reset.execute({ token, newPassword: 'nueva clave larga' }),
        'INVALID_RESET_TOKEN',
        422,
      );
    });

    it('con una contraseña débil el token sigue sirviendo', async () => {
      const token = await requestToken();
      await expectCode(
        t.reset.execute({ token, newPassword: 'password1234' }),
        'WEAK_PASSWORD',
        422,
      );
      await t.reset.execute({ token, newPassword: 'nueva clave larga' });
    });
  });
});
