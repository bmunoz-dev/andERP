import { DrizzleQueryError } from 'drizzle-orm/errors';
import { stdSerializers } from 'pino';

interface PgFields {
  name?: string;
  code?: string;
  constraint_name?: string;
  table_name?: string;
  column_name?: string;
}

/**
 * F21 CA-9: un error de la base se registra solo con códigos y nombres. El mensaje y los
 * parámetros de Drizzle (y a veces el mensaje de Postgres) llevan los valores de la consulta:
 * hashes, textos cifrados o datos personales (constitución VII).
 */
export function serializeError(err: unknown): Record<string, unknown> {
  const pg = (err instanceof DrizzleQueryError ? err.cause : err) as PgFields | undefined;
  if (!(err instanceof DrizzleQueryError) && pg?.name !== 'PostgresError') {
    return stdSerializers.err(err as Error);
  }
  return {
    type: err instanceof DrizzleQueryError ? 'DrizzleQueryError' : 'PostgresError',
    code: pg?.code,
    constraint: pg?.constraint_name,
    table: pg?.table_name,
    column: pg?.column_name,
  };
}
