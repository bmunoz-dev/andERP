import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { existsSync } from 'node:fs';
import postgres from 'postgres';
import { z } from 'zod';
import type { PasswordHasher } from '../modules/auth/application/ports';
import {
  DEFAULT_ACCOUNT_TYPES,
  DEFAULT_BANKS,
  DEFAULT_DOCUMENT_TYPES,
  DEFAULT_EXPENSE_CATEGORIES,
} from '../modules/catalogs/default-categories';
import { Argon2PasswordHasher } from '../modules/auth/infrastructure/argon2-password-hasher';
import type { Database, Tx } from './database.module';
import * as schema from './schema';
import {
  accountTypes,
  banks,
  documentTypes,
  expenseCategories,
  organizationMembers,
  organizations,
  users,
} from './schema';

export const seedInputSchema = z.object({
  SEED_ORG_NAME: z.string().min(1).max(100),
  SEED_ORG_TAX_ID: z.string().min(1).max(20),
  SEED_SUPERADMIN_EMAIL: z.email(),
  SEED_SUPERADMIN_PASSWORD: z.string().min(12),
  SEED_SUPERADMIN_FIRST_NAME: z.string().min(1).max(30),
  SEED_SUPERADMIN_LAST_NAME: z.string().min(1).max(30),
});
export type SeedInput = z.infer<typeof seedInputSchema>;

export interface SeedResult {
  organizationId: string;
  userId: string;
}

/**
 * Crea la organización inicial, el super admin (F01 CA-16), los catálogos globales y las categorías
 * iniciales (F02 CA-6). Es idempotente: busca por NIT y por email, nunca sobrescribe la contraseña de
 * un usuario que ya existe y solo inserta los valores de catálogo que falten.
 */
export async function seed(
  db: Database,
  input: SeedInput,
  hasher: PasswordHasher,
): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    const [existingOrganization] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.taxId, input.SEED_ORG_TAX_ID), isNull(organizations.deletedAt)));
    const [organization] = existingOrganization
      ? [existingOrganization]
      : await tx
          .insert(organizations)
          .values({ name: input.SEED_ORG_NAME, taxId: input.SEED_ORG_TAX_ID })
          .returning({ id: organizations.id });

    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, input.SEED_SUPERADMIN_EMAIL), isNull(users.deletedAt)));
    if (existingUser) {
      await tx.update(users).set({ isSuperAdmin: true }).where(eq(users.id, existingUser.id));
    }
    const [user] = existingUser
      ? [existingUser]
      : await tx
          .insert(users)
          .values({
            email: input.SEED_SUPERADMIN_EMAIL,
            passwordHash: await hasher.hash(input.SEED_SUPERADMIN_PASSWORD),
            firstName: input.SEED_SUPERADMIN_FIRST_NAME,
            lastName: input.SEED_SUPERADMIN_LAST_NAME,
            isSuperAdmin: true,
          })
          .returning({ id: users.id });

    if (!organization || !user) throw new Error('Seed insert returned no rows');

    await tx
      .insert(organizationMembers)
      .values({ userId: user.id, organizationId: organization.id, role: 'admin' })
      .onConflictDoNothing();

    await seedGlobalCatalogs(tx);
    await seedExpenseCategories(tx, organization.id);

    return { organizationId: organization.id, userId: user.id };
  });
}

/** Inserta solo los valores que faltan: si alguien desactivó o renombró uno, no se toca. */
async function seedGlobalCatalogs(tx: Tx): Promise<void> {
  const existingBanks = new Set(
    (await tx.select({ name: banks.name }).from(banks)).map((b) => b.name),
  );
  const missingBanks = DEFAULT_BANKS.filter((name) => !existingBanks.has(name));
  if (missingBanks.length > 0)
    await tx
      .insert(banks)
      .values(missingBanks.map((name) => ({ name })))
      .onConflictDoNothing();

  const existingAccountTypes = new Set(
    (await tx.select({ name: accountTypes.name }).from(accountTypes)).map((a) => a.name),
  );
  const missingAccountTypes = DEFAULT_ACCOUNT_TYPES.filter(
    (name) => !existingAccountTypes.has(name),
  );
  if (missingAccountTypes.length > 0) {
    await tx
      .insert(accountTypes)
      .values(missingAccountTypes.map((name) => ({ name })))
      .onConflictDoNothing();
  }

  const existingCodes = new Set(
    (await tx.select({ code: documentTypes.code }).from(documentTypes)).map((d) => d.code),
  );
  const missingDocumentTypes = DEFAULT_DOCUMENT_TYPES.filter((d) => !existingCodes.has(d.code));
  if (missingDocumentTypes.length > 0)
    await tx.insert(documentTypes).values(missingDocumentTypes).onConflictDoNothing();
}

/** Solo si la organización aún no tiene categorías (una organización recién sembrada). */
async function seedExpenseCategories(tx: Tx, organizationId: string): Promise<void> {
  const [existing] = await tx
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(eq(expenseCategories.organizationId, organizationId))
    .limit(1);
  if (existing) return;
  await tx
    .insert(expenseCategories)
    .values(DEFAULT_EXPENSE_CATEGORIES.map((category) => ({ ...category, organizationId })));
}

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const input = seedInputSchema.parse(process.env);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const result = await seed(
      drizzle(sql, { schema, casing: 'snake_case' }),
      input,
      new Argon2PasswordHasher(),
    );
    console.log(`Seed OK → organization ${result.organizationId}, super admin ${result.userId}`);
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
