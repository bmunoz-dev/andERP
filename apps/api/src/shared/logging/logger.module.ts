import type { DynamicModule } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { Options } from 'pino-http';
import type { Env } from '../../config/env';
import { ensureRequestId } from '../http/request-id';

/** Campos que nunca deben aparecer en los logs (constitución, principio VII). */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-proxy-secret"]',
  'res.headers["set-cookie"]',
  '*.password',
  // F17: por si un error del SDK de S3 incluye su configuración.
  '*.secretAccessKey',
  '*.newPassword',
  '*.currentPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
];

export function createLoggerModule(env: Env, stream?: DestinationStream): DynamicModule {
  const options: Options = {
    level: env.LOG_LEVEL,
    genReqId: (req: IncomingMessage, res: ServerResponse) => ensureRequestId(req, res),
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    ...(env.NODE_ENV === 'development' && !stream
      ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
      : {}),
  };
  return LoggerModule.forRoot({ pinoHttp: stream ? [options, stream] : options });
}
