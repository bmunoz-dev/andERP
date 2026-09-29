import type { AuthSessionResponse } from '@anderp/shared';
import { randomUUID } from 'node:crypto';
import type { Database } from '../../src/db/database.module';
import { expenseCategories, organizationMembers, organizations, users } from '../../src/db/schema';
import { DEFAULT_EXPENSE_CATEGORIES } from '../../src/modules/catalogs/default-categories';
import { Argon2PasswordHasher } from '../../src/modules/auth/infrastructure/argon2-password-hasher';
import type { TestApp } from './create-test-app';

export const TEST_PASSWORD = 'correct horse battery staple';

const hasher = new Argon2PasswordHasher();
let passwordHash: Promise<string> | undefined;

export interface TestOrganization {
  id: string;
  name: string;
}

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

/** Organización con sus categorías iniciales, creada directo en la base de datos. */
export async function createOrganization(
  db: Database,
  name = 'Empresa de prueba',
): Promise<TestOrganization> {
  const [organization] = await db
    .insert(organizations)
    .values({ name, taxId: randomUUID().slice(0, 20) })
    .returning({ id: organizations.id, name: organizations.name });
  if (!organization) throw new Error('Insert returned no rows');
  await db
    .insert(expenseCategories)
    .values(DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ ...c, organizationId: organization.id })));
  return organization;
}

/** Usuario activo con contraseña, miembro de la organización, y su access token. */
export async function createMember(
  t: TestApp,
  db: Database,
  organizationId: string,
  options: { isSuperAdmin?: boolean } = {},
): Promise<TestUser> {
  passwordHash ??= hasher.hash(TEST_PASSWORD);
  const email = `user-${randomUUID()}@empresa.co`;
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash: await passwordHash,
      firstName: 'Ana',
      lastName: 'Gómez',
      isSuperAdmin: options.isSuperAdmin ?? false,
    })
    .returning({ id: users.id });
  if (!user) throw new Error('Insert returned no rows');
  await db.insert(organizationMembers).values({ userId: user.id, organizationId, role: 'admin' });
  return { id: user.id, email, token: await login(t, email) };
}

export async function login(t: TestApp, email: string, password = TEST_PASSWORD): Promise<string> {
  const res = await t.http.post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status}`);
  return (res.body as AuthSessionResponse).accessToken;
}

export interface TwoOrgs {
  orgA: TestOrganization & { admin: TestUser };
  orgB: TestOrganization & { admin: TestUser };
  /** Super admin, miembro de la organización A (como el super admin del seed). */
  superAdmin: TestUser;
}

/** Escenario base de aislamiento (F02-T005): dos organizaciones y un super admin. */
export async function seedTwoOrgs(t: TestApp, db: Database): Promise<TwoOrgs> {
  const orgA = await createOrganization(db, 'Organización A');
  const orgB = await createOrganization(db, 'Organización B');
  return {
    orgA: { ...orgA, admin: await createMember(t, db, orgA.id) },
    orgB: { ...orgB, admin: await createMember(t, db, orgB.id) },
    superAdmin: await createMember(t, db, orgA.id, { isSuperAdmin: true }),
  };
}

/** Atajo para peticiones autenticadas. */
export function as(t: TestApp, token: string) {
  const auth = { Authorization: `Bearer ${token}` };
  return {
    get: (path: string) => t.http.get(`/api/v1${path}`).set(auth),
    post: (path: string, body?: object) => t.http.post(`/api/v1${path}`).set(auth).send(body),
    patch: (path: string, body?: object) => t.http.patch(`/api/v1${path}`).set(auth).send(body),
    put: (path: string, body?: object) => t.http.put(`/api/v1${path}`).set(auth).send(body),
    delete: (path: string) => t.http.delete(`/api/v1${path}`).set(auth),
  };
}
