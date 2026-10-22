import { type AppModule, ErrorCode } from '@anderp/shared';
import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
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
const organizationChanged = () => new DomainError(ErrorCode.ORGANIZATION_CHANGED, 409);

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

    // La organización activa vive en la sesión (F20): un token de otra es de una pestaña vieja.
    const sessionOrg = await this.sessions.findActiveFamilyOrganization(
      claims.sid,
      this.clock.now(),
    );
    if (!sessionOrg) throw new DomainError(ErrorCode.SESSION_REVOKED, 401);
    if (sessionOrg !== claims.org) throw organizationChanged();

    const found = await this.users.findById(claims.sub);
    const { user, membership } = requireAccess(
      found,
      found ? await this.users.findMemberships(found.id) : [],
      sessionOrg,
      401,
    );
    // La desactivaron en la organización de la sesión pero le quedan otras: la web recarga y
    // el refresh pasa a la siguiente (F20 CA-6).
    if (membership.organizationId !== sessionOrg) throw organizationChanged();

    const actor: Actor = {
      userId: user.id,
      organizationId: membership.organizationId,
      role: membership.role,
      modules: membership.modules,
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

export const REQUIRED_MODULE = 'requiredModule';

/**
 * Paquetes de la organización (F19 CA-9): sin el paquete, 403 `MODULE_DISABLED`. Lee
 * `actor.modules`, que el guard global llena en cada petición, así que apagar un paquete
 * corta el acceso de inmediato. No exime al super admin (CA-10).
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppModule | undefined>(REQUIRED_MODULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && this.cls.get('actor')?.modules.includes(required) !== true) {
      throw new DomainError(ErrorCode.MODULE_DISABLED, 403);
    }
    return true;
  }
}

/** Marca un controlador como parte de un paquete que se puede apagar por organización. */
export const RequiresModule = (module: AppModule) =>
  applyDecorators(SetMetadata(REQUIRED_MODULE, module), UseGuards(ModuleGuard));

/** Actor de la petición. Solo se usa en rutas protegidas, donde el guard ya lo dejó. */
export function requireActor(cls: ClsService<RequestContext>): Actor {
  const actor = cls.get('actor');
  if (!actor) throw unauthorized();
  return actor;
}
