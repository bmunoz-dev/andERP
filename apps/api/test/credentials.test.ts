import type { Credential, ResponsiblePerson } from '@anderp/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DB, type Database } from '../src/db/database.module';
import { auditLogs, entityCredentials } from '../src/db/schema';
import { CredentialCipher } from '../src/modules/credentials/credential-cipher';
import { rotateCredentialKeys } from '../src/modules/credentials/rotate-keys';
import { createTestApp, type TestApp, TEST_ENV } from './setup/create-test-app';
import { as, seedTwoOrgs, type TwoOrgs } from './setup/fixtures';
import { resetDb } from './setup/reset-db';

let t: TestApp;
let db: Database;
let s: TwoOrgs;

const api = () => as(t, s.orgA.admin.token);
const SECRET = 'Sup3r-secreta!';

async function newPerson(overrides: Record<string, unknown> = {}): Promise<ResponsiblePerson> {
  return (
    await api()
      .post('/responsible-persons', {
        firstName: 'Ana',
        lastName: 'Gómez',
        email: 'ana@empresa.co',
        ...overrides,
      })
      .expect(201)
  ).body as ResponsiblePerson;
}

async function newCredential(overrides: Record<string, unknown> = {}): Promise<Credential> {
  return (
    await api()
      .post('/credentials', {
        entityName: 'DIAN',
        username: 'contador@empresa.co',
        password: SECRET,
        url: 'https://muisca.dian.gov.co',
        ...overrides,
      })
      .expect(201)
  ).body as Credential;
}

const reveal = async (id: string, app = t) =>
  (await as(app, s.orgA.admin.token).post(`/credentials/${id}/reveal`).expect(200)).body as {
    password: string;
  };

const auditFor = (id: string) =>
  db
    .select({ action: auditLogs.action, changes: auditLogs.changes })
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, 'credential'), eq(auditLogs.entityId, id)));

beforeAll(async () => {
  await resetDb();
  t = await createTestApp();
  db = t.app.get<Database>(DB);
});

beforeEach(async () => {
  s = await seedTwoOrgs(t, db);
});

afterAll(async () => {
  await t.close();
});

describe('Responsables', () => {
  it('CA-1 CRUD con email o teléfono obligatorio', async () => {
    const person = await newPerson({ email: '', phone: '3001234567' });
    expect(person).toMatchObject({ firstName: 'Ana', email: null, phone: '3001234567' });

    const missing = await api().post('/responsible-persons', {
      firstName: 'Sin',
      lastName: 'Contacto',
    });
    expect(missing.status).toBe(422);
    expect(missing.body.code).toBe('CONTACT_REQUIRED');
    const cleared = await api().patch(`/responsible-persons/${person.id}`, { phone: null });
    expect(cleared.body.code).toBe('CONTACT_REQUIRED');

    const invalid = await api().post('/responsible-persons', {
      firstName: 'A'.repeat(31),
      lastName: 'B',
      email: 'no-es-correo',
    });
    expect(invalid.status).toBe(422);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');

    await api().patch(`/responsible-persons/${person.id}`, { lastName: 'Ruiz' }).expect(200);
    const list = (await api().get('/responsible-persons').expect(200)).body as ResponsiblePerson[];
    expect(list.map((p) => p.lastName)).toEqual(['Ruiz']);
    await api().delete(`/responsible-persons/${person.id}`).expect(204);
    await api().get(`/responsible-persons/${person.id}`).expect(404);
  });

  it('CA-2 no se borra un responsable con credenciales', async () => {
    const person = await newPerson();
    const credential = await newCredential({ responsiblePersonId: person.id });
    const res = await api().delete(`/responsible-persons/${person.id}`);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RESPONSIBLE_IN_USE');
    await api().delete(`/credentials/${credential.id}`).expect(204);
    await api().delete(`/responsible-persons/${person.id}`).expect(204);
  });
});

describe('Credenciales', () => {
  it('CA-3 y CA-5 guarda la contraseña cifrada y nunca la devuelve', async () => {
    const person = await newPerson();
    const created = await newCredential({ responsiblePersonId: person.id });
    expect(created).toEqual({
      id: created.id,
      entityName: 'DIAN',
      username: 'contador@empresa.co',
      url: 'https://muisca.dian.gov.co',
      contact1: null,
      contact2: null,
      notes: null,
      hasPassword: true,
      responsiblePerson: { id: person.id, name: 'Ana Gómez' },
    });

    const [row] = await db
      .select()
      .from(entityCredentials)
      .where(eq(entityCredentials.id, created.id));
    expect(row!.passwordIv).toHaveLength(12);
    expect(row!.keyVersion).toBe(1);
    expect(row!.passwordCiphertext.toString('utf8')).not.toContain(SECRET);

    // CA-12 de seguridad: ni el listado ni el detalle exponen campos secretos.
    for (const body of [
      (await api().get('/credentials').expect(200)).text,
      (await api().get(`/credentials/${created.id}`).expect(200)).text,
    ]) {
      expect(body).not.toMatch(/"password"|ciphertext|"iv"|authTag|Sup3r/i);
    }
  });

  it('CA-4 valida límites, URL http(s) y duplicados', async () => {
    for (const body of [
      { entityName: 'x'.repeat(101) },
      { username: 'x'.repeat(255) },
      { password: '' },
      { password: 'x'.repeat(257) },
      { url: 'ftp://dian.gov.co' },
      { url: `https://x.co/${'a'.repeat(2048)}` },
    ]) {
      const res = await api().post('/credentials', {
        entityName: 'DIAN',
        username: 'u',
        password: 'p',
        ...body,
      });
      expect(res.status, JSON.stringify(Object.keys(body))).toBe(422);
    }
    await newCredential();
    const dup = await api().post('/credentials', {
      entityName: 'DIAN',
      username: 'contador@empresa.co',
      password: 'otra',
    });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('DUPLICATE_CREDENTIAL');
  });

  it('CA-6 reveal devuelve la contraseña, no se guarda en caché y queda en la auditoría', async () => {
    const created = await newCredential();
    t.logs.length = 0;
    const res = await api().post(`/credentials/${created.id}/reveal`).expect(200);
    expect(res.body).toEqual({ password: SECRET });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers.pragma).toBe('no-cache');
    expect(t.logs.join('\n')).not.toContain(SECRET);

    const logs = await auditFor(created.id);
    expect(logs).toEqual([{ action: 'credential.reveal', changes: null }]);
  });

  it('CA-7 editar sin contraseña la conserva; con contraseña la vuelve a cifrar', async () => {
    const created = await newCredential();
    const [before] = await db
      .select({ iv: entityCredentials.passwordIv })
      .from(entityCredentials)
      .where(eq(entityCredentials.id, created.id));

    await api().patch(`/credentials/${created.id}`, { notes: 'Token en el celular' }).expect(200);
    expect((await reveal(created.id)).password).toBe(SECRET);

    await api().patch(`/credentials/${created.id}`, { password: 'Nueva-123' }).expect(200);
    expect((await reveal(created.id)).password).toBe('Nueva-123');
    const [after] = await db
      .select({ iv: entityCredentials.passwordIv })
      .from(entityCredentials)
      .where(eq(entityCredentials.id, created.id));
    expect(after!.iv.equals(before!.iv)).toBe(false);

    const updates = (await auditFor(created.id)).filter((l) => l.action === 'credential.update');
    expect(updates).toHaveLength(2);
    expect(updates[0]!.changes).not.toHaveProperty('passwordChanged');
    expect(updates[1]!.changes).toMatchObject({ passwordChanged: true });
    expect(JSON.stringify(updates)).not.toMatch(/Nueva-123|Sup3r/);
  });

  it('CA-8 un texto cifrado copiado a otro registro no se descifra', async () => {
    const a = await newCredential();
    const b = await newCredential({ entityName: 'Banco', password: 'otra' });
    const [source] = await db
      .select()
      .from(entityCredentials)
      .where(eq(entityCredentials.id, a.id));
    await db
      .update(entityCredentials)
      .set({
        passwordCiphertext: source!.passwordCiphertext,
        passwordIv: source!.passwordIv,
        passwordAuthTag: source!.passwordAuthTag,
      })
      .where(eq(entityCredentials.id, b.id));

    t.logs.length = 0;
    const res = await api().post(`/credentials/${b.id}/reveal`);
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('CREDENTIAL_DECRYPT_FAILED');
    expect(t.logs.some((l) => l.includes('Credential integrity check failed'))).toBe(true);
    // El registro dañado bloquearía la rotación de llaves de las pruebas siguientes.
    await db.delete(entityCredentials).where(eq(entityCredentials.id, b.id));
  });

  it('CA-9 busca por entidad, usuario o responsable', async () => {
    const person = await newPerson({ firstName: 'Marta', lastName: 'López' });
    await newCredential();
    await newCredential({ entityName: 'Bancolombia', username: 'tesoreria' });
    await newCredential({
      entityName: 'Secretaría',
      username: 'impuestos',
      responsiblePersonId: person.id,
    });
    const search = async (q: string) =>
      (
        (
          await api()
            .get(`/credentials?search=${encodeURIComponent(q)}`)
            .expect(200)
        ).body as Credential[]
      ).map((c) => c.entityName);
    expect(await search('banco')).toEqual(['Bancolombia']);
    expect(await search('contador')).toEqual(['DIAN']);
    expect(await search('marta lóp')).toEqual(['Secretaría']);
    expect(await search('%')).toEqual([]);
    expect(await search('')).toHaveLength(3);
  });
});

describe('Llaves', () => {
  it('CA-11 y CA-12 rota a una llave nueva y revela con ella', async () => {
    const created = await newCredential();
    const key2 = Buffer.alloc(32, 9).toString('base64');
    const onlyKey2 = await createTestApp({
      env: { CREDENTIALS_KEYS: JSON.stringify({ '2': key2 }), CREDENTIALS_ACTIVE_KEY_VERSION: '2' },
    });
    try {
      // CA-12: la llave con la que se cifró ya no está configurada.
      const res = await as(onlyKey2, s.orgA.admin.token).post(`/credentials/${created.id}/reveal`);
      expect(res.status).toBe(500);
      expect(res.body.code).toBe('CREDENTIAL_KEY_UNAVAILABLE');

      const both = new CredentialCipher(
        new Map([
          [1, Buffer.from(JSON.parse(TEST_ENV.CREDENTIALS_KEYS)['1'] as string, 'base64')],
          [2, Buffer.from(key2, 'base64')],
        ]),
        2,
      );
      expect(await rotateCredentialKeys(db, both, 1)).toBeGreaterThanOrEqual(1);
      expect(await rotateCredentialKeys(db, both, 1)).toBe(0);
      expect((await reveal(created.id, onlyKey2)).password).toBe(SECRET);
    } finally {
      await onlyKey2.close();
    }
  });
});

describe('Aislamiento', () => {
  it('CA-13 otra organización recibe 404 en credenciales y responsables ajenos', async () => {
    const person = await newPerson();
    const created = await newCredential({ responsiblePersonId: person.id });
    const other = as(t, s.orgB.admin.token);

    expect((await other.get('/credentials').expect(200)).body).toEqual([]);
    expect((await other.get('/responsible-persons').expect(200)).body).toEqual([]);
    for (const res of [
      await other.get(`/credentials/${created.id}`),
      await other.patch(`/credentials/${created.id}`, { notes: 'x' }),
      await other.delete(`/credentials/${created.id}`),
      await other.post(`/credentials/${created.id}/reveal`),
      await other.get(`/responsible-persons/${person.id}`),
      await other.patch(`/responsible-persons/${person.id}`, { lastName: 'X' }),
      await other.delete(`/responsible-persons/${person.id}`),
    ]) {
      expect(res.status).toBe(404);
    }
    expect(await auditFor(created.id)).toEqual([]);

    // Tampoco puede asignarle a su credencial un responsable de la organización A.
    const res = await other.post('/credentials', {
      entityName: 'DIAN',
      username: 'u',
      password: 'p',
      responsiblePersonId: person.id,
    });
    expect(res.status).toBe(422);
  });
});
