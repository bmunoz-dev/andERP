import { ErrorCode } from '@anderp/shared';

export interface MappedError {
  status: number;
  code: string;
}

interface PostgresErrorLike {
  code: string;
  message: string;
  constraint_name?: string;
}

const SQLSTATE = /^[0-9A-Z]{5}$/;
const ERROR_CODE = /^[A-Z][A-Z0-9_]+$/;
const MAX_CAUSE_DEPTH = 5;

/**
 * Restricciones nombradas → `code` de negocio. Cada feature registra las suyas
 * (p. ej. `service_providers_document_uq` → `DUPLICATE_DOCUMENT`).
 */
const constraintRegistry: Record<string, string> = {};

export function registerConstraintCodes(codes: Readonly<Record<string, string>>): void {
  Object.assign(constraintRegistry, codes);
}

function isPostgresError(value: unknown): value is PostgresErrorLike {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PostgresErrorLike> & { name?: unknown; severity?: unknown };
  return (
    typeof candidate.code === 'string' &&
    SQLSTATE.test(candidate.code) &&
    (candidate.name === 'PostgresError' || typeof candidate.severity === 'string')
  );
}

/** Drizzle envuelve el error del driver en `cause`; se busca hasta unos pocos niveles. */
function findPostgresError(error: unknown): PostgresErrorLike | undefined {
  let current: unknown = error;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current; depth++) {
    if (isPostgresError(current)) return current;
    current = current instanceof Error ? current.cause : undefined;
  }
  return undefined;
}

/**
 * Traduce violaciones de restricciones y excepciones de triggers (design.md §7).
 * Devuelve `null` si el error no es de un tipo que la API deba exponer como 4xx.
 */
export function mapPostgresError(
  error: unknown,
  constraintCodes: Readonly<Record<string, string>> = constraintRegistry,
): MappedError | null {
  const pg = findPostgresError(error);
  if (!pg) return null;

  const byConstraint = (fallback: string) =>
    (pg.constraint_name && constraintCodes[pg.constraint_name]) ?? fallback;

  switch (pg.code) {
    case '23505': // unique_violation
    case '23P01': // exclusion_violation
      return { status: 409, code: byConstraint(ErrorCode.CONFLICT) };
    case '23503': // foreign_key_violation
    case '23514': // check_violation
      return { status: 422, code: byConstraint(ErrorCode.UNPROCESSABLE) };
    case 'P0001': // raise_exception desde un trigger: el mensaje es el `code`
      return {
        status: 422,
        code: ERROR_CODE.test(pg.message) ? pg.message : ErrorCode.UNPROCESSABLE,
      };
    default:
      return null;
  }
}
