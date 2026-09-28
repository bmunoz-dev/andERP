import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type Access, toProfile } from './access';
import {
  ACCESS_TOKEN_ISSUER,
  type AccessTokenIssuer,
  CLOCK,
  type Clock,
  type IssuedSession,
  OPAQUE_TOKENS,
  type OpaqueTokens,
  type RequestMeta,
  SESSION_REPOSITORY,
  type SessionRepository,
} from './ports';

/** Vida del refresh token. Cada refresh emite uno nuevo con 7 días más (sesión deslizante). */
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class SessionIssuer {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(ACCESS_TOKEN_ISSUER) private readonly accessTokens: AccessTokenIssuer,
    @Inject(OPAQUE_TOKENS) private readonly tokens: OpaqueTokens,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Crea una sesión. Sin `familyId` empieza una familia nueva (login); con él, rota (refresh). */
  async issue(
    access: Access,
    meta: RequestMeta,
    familyId: string = randomUUID(),
  ): Promise<IssuedSession> {
    const refreshToken = this.tokens.generate();
    const refreshExpiresAt = new Date(this.clock.now().getTime() + REFRESH_TOKEN_TTL_MS);

    await this.sessions.create({
      userId: access.user.id,
      familyId,
      tokenHash: this.tokens.hash(refreshToken),
      expiresAt: refreshExpiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const accessToken = await this.accessTokens.issue({
      sub: access.user.id,
      org: access.membership.organizationId,
      role: access.membership.role,
      sa: access.user.isSuperAdmin,
      sid: familyId,
    });

    return { accessToken, refreshToken, refreshExpiresAt, user: toProfile(access) };
  }
}
