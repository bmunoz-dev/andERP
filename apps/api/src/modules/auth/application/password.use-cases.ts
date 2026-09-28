import type { ChangePasswordRequest, ResetPasswordRequest } from '@anderp/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../../../config/env';
import type { Actor } from '../../../shared/context/request-context';
import { AUDIT_LOGGER, type AuditLogger } from '../../audit/audit.service';
import { MAILER, type Mailer } from '../../mail/mailer';
import { passwordResetEmail } from '../../mail/templates';
import { authErrors } from '../domain/auth-errors';
import { assertPasswordPolicy } from '../domain/password-policy';
import {
  CLOCK,
  type Clock,
  COMMON_PASSWORDS,
  type CommonPasswords,
  OPAQUE_TOKENS,
  type OpaqueTokens,
  PASSWORD_HASHER,
  PASSWORD_RESET_REPOSITORY,
  type PasswordHasher,
  type PasswordResetRepository,
  SESSION_REPOSITORY,
  type SessionRepository,
  USER_REPOSITORY,
  type UserRepository,
} from './ports';

export const PASSWORD_RESET_TTL_MINUTES = 30;

/** F01 CA-13: exige la contraseña actual y cierra las demás sesiones. */
@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(COMMON_PASSWORDS) private readonly common: CommonPasswords,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async execute(
    actor: Actor,
    { currentPassword, newPassword }: ChangePasswordRequest,
  ): Promise<void> {
    const user = await this.users.findById(actor.userId);
    if (!user?.passwordHash) throw authErrors.accountDisabled(401);
    if (!(await this.hasher.verify(user.passwordHash, currentPassword))) {
      throw authErrors.invalidCurrentPassword();
    }
    assertPasswordPolicy(newPassword, this.common.list);

    await this.users.updatePassword(user.id, await this.hasher.hash(newPassword));
    await this.sessions.revokeAllForUser(user.id, this.clock.now(), actor.sessionFamilyId);
    await this.audit.log({
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: user.id,
    });
  }
}

/** F01 CA-14: responde igual exista o no el email; el correo sale en segundo plano. */
@Injectable()
export class RequestPasswordResetUseCase {
  private readonly logger = new Logger(RequestPasswordResetUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_RESET_REPOSITORY) private readonly resets: PasswordResetRepository,
    @Inject(OPAQUE_TOKENS) private readonly tokens: OpaqueTokens,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async execute(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (user?.status !== 'active') return;

    const now = this.clock.now();
    const token = this.tokens.generate();
    await this.resets.invalidateOpen(user.id, 'reset', now);
    await this.resets.create({
      userId: user.id,
      purpose: 'reset',
      tokenHash: this.tokens.hash(token),
      expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000),
    });
    await this.audit.log({
      action: 'auth.password_reset_requested',
      userId: user.id,
      organizationId: null,
    });

    const link = new URL('/restablecer', this.env.WEB_URL);
    link.searchParams.set('token', token);
    const message = passwordResetEmail({
      to: user.email,
      firstName: user.firstName,
      link: link.toString(),
      expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
    });
    // Sin await: esperar al SMTP haría que la respuesta tarde más cuando el email existe.
    this.mailer.send(message).catch((error: unknown) => {
      this.logger.error({ err: error, userId: user.id }, 'Password reset email failed');
    });
  }
}

/** F01 CA-15 (y F02: acepta invitaciones). Cierra todas las sesiones del usuario. */
@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_RESET_REPOSITORY) private readonly resets: PasswordResetRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(OPAQUE_TOKENS) private readonly tokens: OpaqueTokens,
    @Inject(COMMON_PASSWORDS) private readonly common: CommonPasswords,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async execute({ token, newPassword }: ResetPasswordRequest): Promise<void> {
    const now = this.clock.now();
    const reset = await this.resets.findByTokenHash(this.tokens.hash(token));
    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= now.getTime()) {
      throw authErrors.invalidResetToken();
    }
    const user = await this.users.findById(reset.userId);
    if (!user || user.status === 'inactive') throw authErrors.invalidResetToken();

    // La política se valida antes de gastar el token: con una clave débil se puede reintentar.
    assertPasswordPolicy(newPassword, this.common.list);
    if (!(await this.resets.markUsedIfUnused(reset.id, now))) throw authErrors.invalidResetToken();

    await this.users.updatePassword(user.id, await this.hasher.hash(newPassword));
    await this.sessions.revokeAllForUser(user.id, now);
    await this.audit.log({
      action: 'auth.password_reset',
      userId: user.id,
      organizationId: null,
      changes: { purpose: reset.purpose },
    });
  }
}
