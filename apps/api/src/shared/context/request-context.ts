import type { MemberRole } from '@anderp/shared';
import type { Request } from 'express';
import { ClsModule, type ClsStore } from 'nestjs-cls';
import { requestIdOf } from '../http/request-id';

/** Usuario autenticado de la petición. Lo llena el guard global de auth (F01). */
export interface Actor {
  userId: string;
  organizationId: string;
  role: MemberRole;
  isSuperAdmin: boolean;
  /** `family_id` de la sesión con la que se emitió el access token. */
  sessionFamilyId: string;
}

/** Contexto por petición (AsyncLocalStorage). F02 lo usa en el repositorio base. */
export interface RequestContext extends ClsStore {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  actor?: Actor;
}

export const RequestContextModule = ClsModule.forRoot({
  global: true,
  middleware: {
    mount: true,
    generateId: true,
    idGenerator: (req: Request) => requestIdOf(req),
    setup: (cls, req: Request) => {
      cls.set('requestId', requestIdOf(req));
      cls.set('ip', req.ip ?? null);
      cls.set('userAgent', req.headers['user-agent'] ?? null);
    },
  },
});
