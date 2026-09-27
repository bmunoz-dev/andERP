import type { ProblemFieldError } from '@anderp/shared';

/**
 * Error esperado del negocio. El filtro global lo convierte en Problem Details
 * con su `status` y `code` (design.md §7).
 */
export class DomainError extends Error {
  override name = 'DomainError';

  constructor(
    readonly code: string,
    readonly status: number,
    readonly detail?: string,
    readonly errors?: ProblemFieldError[],
  ) {
    super(detail ?? code);
  }
}
