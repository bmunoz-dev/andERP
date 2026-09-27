import { ErrorCode, type ProblemDetails, type ProblemFieldError } from '@anderp/shared';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ZodValidationException } from 'nestjs-zod';
import { requestIdOf } from '../http/request-id';
import { DomainError } from './domain-error';
import { mapPostgresError } from './pg-error.mapper';

type Problem = Pick<ProblemDetails, 'status' | 'code' | 'detail' | 'errors'>;

const CODE_BY_STATUS: Readonly<Record<number, string>> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  422: ErrorCode.UNPROCESSABLE,
  429: ErrorCode.TOO_MANY_REQUESTS,
  503: ErrorCode.SERVICE_UNAVAILABLE,
};

/**
 * Convierte cualquier excepción en una respuesta RFC 9457 (design.md §7).
 * Los errores no controlados se registran completos y el cliente solo recibe el `requestId`.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(ProblemDetailsFilter.name) private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const problem = this.toProblem(exception);
    if (problem.status >= 500) {
      if (exception instanceof DomainError) {
        this.logger.warn({ code: problem.code, detail: exception.detail }, 'Service error');
      } else {
        this.logger.error({ err: exception }, 'Unhandled error');
      }
    }

    const body: ProblemDetails = {
      type: 'about:blank',
      title: STATUS_CODES[problem.status] ?? 'Error',
      status: problem.status,
      code: problem.code,
      requestId: requestIdOf(req),
      ...(problem.detail ? { detail: problem.detail } : {}),
      ...(problem.errors ? { errors: problem.errors } : {}),
    };
    res.status(problem.status).type('application/problem+json').json(body);
  }

  private toProblem(exception: unknown): Problem {
    if (exception instanceof DomainError) {
      return {
        status: exception.status,
        code: exception.code,
        ...(exception.detail ? { detail: exception.detail } : {}),
        ...(exception.errors ? { errors: exception.errors } : {}),
      };
    }

    if (exception instanceof ZodValidationException) {
      return { status: 422, code: ErrorCode.VALIDATION_ERROR, errors: zodIssues(exception) };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        code: CODE_BY_STATUS[status] ?? (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST),
      };
    }

    const mapped = mapPostgresError(exception);
    if (mapped) return mapped;

    return { status: 500, code: ErrorCode.INTERNAL_ERROR };
  }
}

function zodIssues(exception: ZodValidationException): ProblemFieldError[] {
  const error = exception.getZodError() as {
    issues?: { path: PropertyKey[]; message: string }[];
  };
  return (error.issues ?? []).map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}
