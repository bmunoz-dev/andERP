import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

// Solo se acepta un id entrante con forma segura, para no permitir inyección en los logs.
const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

type WithId = IncomingMessage & { id?: unknown };

/**
 * Asigna el id de la petición una sola vez, lo ejecute quien lo ejecute primero: pino-http
 * (`genReqId`) o el middleware. Así logs, contexto y Problem Details comparten el mismo id.
 */
export function ensureRequestId(req: IncomingMessage, res: ServerResponse): string {
  const withId = req as WithId;
  if (typeof withId.id === 'string') return withId.id;

  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  withId.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  ensureRequestId(req, res);
  next();
}

export function requestIdOf(req: Request): string {
  return typeof req.id === 'string' ? req.id : 'unknown';
}
