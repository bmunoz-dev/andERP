import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import { auditLogs } from '../src/db/schema';
import { createTestApp, type TestApp } from './setup/create-test-app';
import { createMember, createOrganization, TEST_PASSWORD } from './setup/fixtures';
import { resetDb } from './setup/reset-db';

const SECRET = 'proxy-secret-that-is-at-least-32-chars';

/** F07 CA-8 y CA-9: la API solo atiende al proxy de la web y envía cabeceras de seguridad. */
describe('Proxy de la web', () => {
  let t: TestApp;
  let db: Database;
  let email: string;

  beforeAll(async () => {
    await resetDb();
    // Con el secreto vacío el proxy está desactivado: así se crea el usuario de prueba.
    const setup = await createTestApp();
    db = setup.app.get<Database>(DB);
    const org = await createOrganization(db);
    email = (await createMember(setup, db, org.id)).email;
    await setup.close();
    t = await createTestApp({ env: { PROXY_SECRET: SECRET, AUTH_THROTTLE_LIMIT: '2' } });
    db = t.app.get<Database>(DB);
  });

  afterAll(async () => {
    await t.close();
  });

  const login = (ip: string, password = 'wrong-password-123') =>
    t.http
      .post('/api/v1/auth/login')
      .set('X-Proxy-Secret', SECRET)
      .set('X-Client-IP', ip)
      .send({ email, password });

  it('CA-8 sin el secreto correcto responde 403, salvo /health', async () => {
    const missing = await t.http.get('/api/v1/auth/me');
    expect(missing.status).toBe(403);
    expect(missing.body).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    await t.http.get('/api/v1/auth/me').set('X-Proxy-Secret', `${SECRET}x`).expect(403);
    await t.http.get('/api/v1/auth/me').set('X-Proxy-Secret', SECRET).expect(401);
    await t.http.get('/api/v1/health').expect(200);
  });

  it('CA-8 la IP del cliente llega a la auditoría', async () => {
    await login('203.0.113.7', TEST_PASSWORD).expect(200);
    const [entry] = await db
      .select({ action: auditLogs.action, ip: auditLogs.ip })
      .from(auditLogs)
      .where(eq(auditLogs.action, 'auth.login'))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    expect(entry).toEqual({ action: 'auth.login', ip: '203.0.113.7' });
  });

  it('CA-8 el throttler cuenta por la IP del cliente, no por la del proxy', async () => {
    await login('198.51.100.1').expect(401);
    await login('198.51.100.1').expect(401);
    await login('198.51.100.1').expect(429);
    await login('198.51.100.2').expect(401);
  });

  it('CA-9 envía las cabeceras de seguridad de helmet', async () => {
    const res = await t.http.get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
