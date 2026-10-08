import { z } from 'zod';

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

/** `{"1":"<base64 de 32 bytes>", ...}` → versión → llave AES-256 (F06 CA-10). */
const keyRing = z.string().transform((json, ctx) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = null;
  }
  const keys = new Map<number, Buffer>();
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    for (const [version, value] of Object.entries(parsed)) {
      const key = typeof value === 'string' ? Buffer.from(value, 'base64') : Buffer.alloc(0);
      if (!/^[1-9]\d{0,3}$/.test(version) || key.length !== 32) break;
      keys.set(Number(version), key);
    }
  }
  if (keys.size === 0 || keys.size !== Object.keys(parsed ?? {}).length) {
    ctx.addIssue({ code: 'custom', message: 'expected {"<version>": "<base64 of 32 bytes>"}' });
    return z.NEVER;
  }
  return keys;
});

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // No se usa PORT: muchas herramientas (lanzadores, proveedores) lo definen para su propio uso.
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: postgresUrl,

    // F01 — auth
    JWT_SECRET: z.string().min(32),
    WEB_URL: z.url({ protocol: /^https?$/ }),
    AUTH_THROTTLE_LIMIT: z.coerce.number().int().min(1).default(10),

    // F01 — correo
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535),
    SMTP_SECURE: z.stringbool().default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().min(3),

    // F06 — cifrado de credenciales
    CREDENTIALS_KEYS: keyRing,
    CREDENTIALS_ACTIVE_KEY_VERSION: z.coerce.number().int().min(1).max(9999),
  })
  .refine((env) => env.CREDENTIALS_KEYS.has(env.CREDENTIALS_ACTIVE_KEY_VERSION), {
    path: ['CREDENTIALS_KEYS'],
    message: 'the active key version is not configured',
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
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.code}`);
    throw new InvalidEnvError(`Invalid environment variables → ${problems.join('; ')}`);
  }
  return result.data;
}
