import type { LoginRequest } from '@anderp/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '../../audit/audit.service';
import { authErrors } from '../domain/auth-errors';
import { isLocked } from '../domain/login-attempts';
import { type Access, requireAccess } from './access';
import {
  CLOCK,
  type Clock,
  type IssuedSession,
  PASSWORD_HASHER,
  PASSWORD_RESET_REPOSITORY,
  type PasswordHasher,
  type PasswordResetRepository,
  type RequestMeta,
  SESSION_REPOSITORY,
  type SessionRepository,
  USER_REPOSITORY,
  type UserRepository,
} from './ports';
import { SessionIssuer } from './session-issuer';

@Injectable()
export class LoginUseCase {
  private readonly logger = new Logger(LoginUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly sessions: SessionIssuer,
    @Inject(SESSION_REPOSITORY) private readonly sessionRows: SessionRepository,
    @Inject(PASSWORD_RESET_REPOSITORY) private readonly resets: PasswordResetRepository,
  ) {}

  async execute({ email, password }: LoginRequest, meta: RequestMeta): Promise<IssuedSession> {
    const now = this.clock.now();
    const user = await this.users.findByEmail(email);

    // Email inexistente o invitación sin aceptar: misma respuesta y tiempo que una clave errada.
    if (!user?.passwordHash) {
      await this.hasher.verifyDummy(password);
      await this.failed(user?.id ?? null, user ? 'no_password' : 'unknown_email', email);
      throw authErrors.invalidCredentials();
    }

    // El bloqueo se revisa antes de verificar la contraseña: bloqueado no se prueba nada.
    if (isLocked(user.lockedUntil, now)) {
      await this.failed(user.id, 'locked', email);
      throw authErrors.accountLocked();
    }

    if (!(await this.hasher.verify(user.passwordHash, password))) {
      const result = await this.users.registerFailedLogin(user.id, now);
      await this.failed(user.id, 'wrong_password', email);
      if (result.locked) {
        await this.audit.log({
          action: 'auth.account_locked',
          userId: user.id,
          organizationId: null,
        });
      }
      throw authErrors.invalidCredentials();
    }

    let access: Access;
    try {
      access = requireAccess(user, await this.users.findMemberships(user.id), null);
    } catch (error) {
      await this.failed(user.id, 'disabled', email);
      throw error;
    }

    const rehashed = this.hasher.needsRehash(user.passwordHash)
      ? await this.hasher.hash(password)
      : null;
    await this.users.recordSuccessfulLogin(
      user.id,
      access.membership.organizationId,
      now,
      rehashed,
    );

    const session = await this.sessions.issue(access, meta);
    await this.audit.log({
      action: 'auth.login',
      userId: user.id,
      organizationId: access.membership.organizationId,
    });
    await this.cleanUp(user.id, now);
    return session;
  }

  /** F21 CA-4: sin tareas programadas, cada login limpia lo vencido del propio usuario. */
  private async cleanUp(userId: string, now: Date): Promise<void> {
    try {
      await this.sessionRows.deleteExpiredForUser(userId, now);
      await this.resets.deleteSpentForUser(userId, now);
    } catch (error) {
      this.logger.error({ err: error, userId }, 'Login cleanup failed');
    }
  }

  private failed(userId: string | null, reason: string, email: string): Promise<void> {
    return this.audit.log({
      action: 'auth.login_failed',
      userId,
      organizationId: null,
      changes: { reason, email },
    });
  }
}
