import type { Request } from 'express';
import { ClsModule, type ClsStore } from 'nestjs-cls';
import { requestIdOf } from '../http/request-id';

/**
 * Contexto por petición (AsyncLocalStorage). F01 añade `userId`, `organizationId`,
 * `role` e `isSuperAdmin`; F02 lo usa en el repositorio base.
 */
export interface RequestContext extends ClsStore {
  requestId: string;
}

export const RequestContextModule = ClsModule.forRoot({
  global: true,
  middleware: {
    mount: true,
    generateId: true,
    idGenerator: (req: Request) => requestIdOf(req),
    setup: (cls, req: Request) => {
      cls.set('requestId', requestIdOf(req));
    },
  },
});
