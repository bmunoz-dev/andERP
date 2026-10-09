import { ErrorCode, type ProblemDetails } from '@anderp/shared';
import type { NextFunction, Request, Response } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { requestIdOf } from './request-id';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * F07 CA-8: en producción la API solo atiende al proxy de la web (Worker de Cloudflare), que agrega
 * `X-Proxy-Secret` y la IP real del navegador en `X-Client-IP`. Con el secreto válido esa IP pasa
 * a ser `req.ip`, la que usan el throttler y la auditoría. `/health` queda abierto para Render.
 * Sin `PROXY_SECRET` (desarrollo y pruebas) no hace nada.
 */
export function proxySecretMiddleware(secret: string | undefined, healthPath: string) {
  const expected = secret ? digest(secret) : null;
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!expected || req.path === healthPath) {
      next();
      return;
    }
    const received = req.header('x-proxy-secret');
    // Se comparan los hashes: misma longitud siempre y comparación en tiempo constante.
    if (received === undefined || !timingSafeEqual(digest(received), expected)) {
      const body: ProblemDetails = {
        type: 'about:blank',
        title: 'Forbidden',
        status: 403,
        code: ErrorCode.FORBIDDEN,
        requestId: requestIdOf(req),
      };
      res.status(403).type('application/problem+json').json(body);
      return;
    }
    const clientIp = req.header('x-client-ip');
    if (clientIp) Object.defineProperty(req, 'ip', { value: clientIp });
    next();
  };
}
