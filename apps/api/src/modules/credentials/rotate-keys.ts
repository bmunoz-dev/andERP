import { asc, eq, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { existsSync } from 'node:fs';
import postgres from 'postgres';
import { loadEnv } from '../../config/env';
import type { Database } from '../../db/database.module';
import * as schema from '../../db/schema';
import { entityCredentials } from '../../db/schema';
import { CredentialCipher, credentialAad } from './credential-cipher';

/**
 * F06 CA-11: vuelve a cifrar con la llave activa las credenciales que usan otra versión, en
 * lotes, cada uno en su transacción. Es idempotente: lo ya rotado no se vuelve a tocar.
 */
export async function rotateCredentialKeys(
  db: Database,
  cipher: CredentialCipher,
  batchSize = 100,
): Promise<number> {
  let total = 0;
  for (;;) {
    const count = await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: entityCredentials.id,
          organizationId: entityCredentials.organizationId,
          ciphertext: entityCredentials.passwordCiphertext,
          iv: entityCredentials.passwordIv,
          authTag: entityCredentials.passwordAuthTag,
          keyVersion: entityCredentials.keyVersion,
        })
        .from(entityCredentials)
        .where(ne(entityCredentials.keyVersion, cipher.activeVersion))
        .orderBy(asc(entityCredentials.id))
        .limit(batchSize)
        .for('update');
      for (const row of rows) {
        const aad = credentialAad(row.organizationId, row.id);
        const secret = cipher.encrypt(cipher.decrypt(row, aad), aad);
        await tx
          .update(entityCredentials)
          .set({
            passwordCiphertext: secret.ciphertext,
            passwordIv: secret.iv,
            passwordAuthTag: secret.authTag,
            keyVersion: secret.keyVersion,
          })
          .where(eq(entityCredentials.id, row.id));
      }
      return rows.length;
    });
    total += count;
    if (count < batchSize) return total;
  }
}

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = loadEnv(process.env);
  const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => undefined });
  try {
    const db = drizzle(sql, { schema, casing: 'snake_case' });
    const cipher = new CredentialCipher(env.CREDENTIALS_KEYS, env.CREDENTIALS_ACTIVE_KEY_VERSION);
    const count = await rotateCredentialKeys(db, cipher);
    console.log(
      `Credentials rotated to key version ${String(cipher.activeVersion)}: ${String(count)}`,
    );
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
