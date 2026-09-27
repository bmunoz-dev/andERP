import { z } from 'zod';

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: postgresUrl,
});

export type Env = z.infer<typeof envSchema>;

/** Token de inyección del entorno validado. */
export const ENV = Symbol('ENV');

export class InvalidEnvError extends Error {
  override name = 'InvalidEnvError';
}

/**
 * Valida las variables de entorno al arrancar. Si algo falla, la API no inicia.
 * El mensaje nombra las variables pero nunca incluye sus valores (pueden ser secretos).
 */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.code}`,
    );
    throw new InvalidEnvError(`Invalid environment variables → ${problems.join('; ')}`);
  }
  return result.data;
}
