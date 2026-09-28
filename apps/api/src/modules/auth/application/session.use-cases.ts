import type { AuthProfile } from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '../../audit/audit.service';
import { authErrors } from '../domain/auth-errors';
import { type Access, requireAccess, toProfile } from './access';
import {
  CLOCK,
  type Clock,
  type IssuedSession,
  OPAQUE_TOKENS,
  type OpaqueTokens,
  type RequestMeta,
  SESSION_REPOSITORY,
  type SessionRepository,
  USER_REPOSITORY,
  type UserRepository,
} from './ports';
import { SessionIssuer } from './session-issuer';

/** Rota el refresh token (F01 CA-7) y detecta su reutilización (CA-8). */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(OPAQUE_TOKENS) private readonly tokens: OpaqueTokens,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly issuer: SessionIssuer,
  ) {}

  async execute(refreshToken: string | undefined, meta: RequestMeta): Promise<IssuedSession> {
    if (!refreshToken) throw authErrors.sessionRevoked();
    const now = this.clock.now();
    const session = await this.sessions.findByTokenHash(this.tokens.hash(refreshToken));
    if (!session || session.expiresAt.getTime() <= now.getTime()) {
      throw authErrors.sessionRevoked();
    }

    // Un token ya rotado solo lo presenta quien lo copió: se cierra toda la familia.
    const rotated =
      session.revokedAt === null && (await this.sessions.revokeIfActive(session.id, now));
    if (!rotated) {
      await this.sessions.revokeFamily(session.familyId, now);
      await this.audit.log({
        action: 'auth.session_reuse_detected',
        userId: session.userId,
        organizationId: null,
        changes: { familyId: session.familyId },
      });
      throw authErrors.sessionRevoked();
    }

    const user = await this.users.findById(session.userId);
    const membership = user ? await this.users.findMembership(user.id) : null;
    let access: Access;
    try {
      access = requireAccess(user, membership, 401);
    } catch (error) {
      await this.sessions.revokeFamily(session.familyId, now);
      throw error;
    }

    return this.issuer.issue(access, meta, session.familyId);
  }
}

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(OPAQUE_TOKENS) private readonly tokens: OpaqueTokens,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  /** Idempotente: sin cookie o con un token desconocido no hace nada. */
  async execute(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const session = await this.sessions.findByTokenHash(this.tokens.hash(refreshToken));
    if (!session) return;
    if (await this.sessions.revokeIfActive(session.id, this.clock.now())) {
      await this.audit.log({ action: 'auth.logout', userId: session.userId, organizationId: null });
    }
  }
}

@Injectable()
export class GetCurrentUserUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async execute(userId: string): Promise<AuthProfile> {
    const user = await this.users.findById(userId);
    const membership = user ? await this.users.findMembership(user.id) : null;
    return toProfile(requireAccess(user, membership, 401));
  }
}
