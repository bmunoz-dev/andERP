import { ErrorCode } from '@anderp/shared';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { IS_PUBLIC } from '../../../shared/auth/public.decorator';
import type { Actor, RequestContext } from '../../../shared/context/request-context';
import { DomainError } from '../../../shared/errors/domain-error';
import { requireAccess } from '../application/access';
import {
  type AccessTokenClaims,
  CLOCK,
  type Clock,
  SESSION_REPOSITORY,
  type SessionRepository,
  USER_REPOSITORY,
  type UserRepository,
} from '../application/ports';

const unauthorized = () => new DomainError(ErrorCode.UNAUTHORIZED, 401);

/**
 * Guard global (F01 CA-11): toda ruta exige un access token válido salvo las `@Public()`.
 * Revisa en la base de datos que el usuario siga activo y la sesión siga abierta, y deja
 * el `Actor` en el contexto de la petición.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const header = context.switchToHttp().getRequest<Request>().headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(header.slice('Bearer '.length));
    } catch (error) {
      if (error instanceof TokenExpiredError) throw new DomainError(ErrorCode.TOKEN_EXPIRED, 401);
      throw unauthorized();
    }

    if (!(await this.sessions.isFamilyActive(claims.sid, this.clock.now()))) {
      throw new DomainError(ErrorCode.SESSION_REVOKED, 401);
    }

    const found = await this.users.findById(claims.sub);
    const { user, membership } = requireAccess(
      found,
      found ? await this.users.findMembership(found.id) : null,
      401,
    );

    const actor: Actor = {
      userId: user.id,
      organizationId: membership.organizationId,
      role: membership.role,
      isSuperAdmin: user.isSuperAdmin,
      sessionFamilyId: claims.sid,
    };
    this.cls.set('actor', actor);
    return true;
  }
}

/** Rutas de plataforma (F02): solo el super admin. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly cls: ClsService<RequestContext>) {}

  canActivate(): boolean {
    if (this.cls.get('actor')?.isSuperAdmin !== true) {
      throw new DomainError(ErrorCode.FORBIDDEN, 403);
    }
    return true;
  }
}

export const SuperAdminOnly = () => UseGuards(SuperAdminGuard);

/** Actor de la petición. Solo se usa en rutas protegidas, donde el guard ya lo dejó. */
export function requireActor(cls: ClsService<RequestContext>): Actor {
  const actor = cls.get('actor');
  if (!actor) throw unauthorized();
  return actor;
}
