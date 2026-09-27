import { moneySchema } from '@anderp/shared';
import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { createZodDto } from 'nestjs-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DB, type Database } from '../src/db/database.module';
import { DomainError } from '../src/shared/errors/domain-error';
import { createTestApp, type TestApp } from './setup/create-test-app';
import { resetDb, withOwnerSql, withRuntimeSql } from './setup/reset-db';

interface LogEntry {
  msg?: string;
  req?: { id?: string };
  err?: { message?: string };
}

class CreateThingDto extends createZodDto(
  z.object({ name: z.string().min(1), amount: moneySchema }),
) {}

// Rutas que solo existen en las pruebas.
@Controller('test')
class TestErrorsController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Post('boom')
  boom(): never {
    throw new Error('boom');
  }

  @Get('domain-error')
  domainError(): never {
    throw new DomainError('THING_ALREADY_EXISTS', 409, 'The thing already exists');
  }

  @Get('trigger-error')
  async triggerError(): Promise<void> {
    await this.db.execute(sql`do $$ begin raise exception 'TEST_TRIGGER_CODE'; end $$`);
  }

  @Post('things')
  create(@Body() body: CreateThingDto): CreateThingDto {
    return body;
  }
}

describe('F00 — fundaciones de la API', () => {
  let t: TestApp;

  beforeAll(async () => {
    await resetDb();
    t = await createTestApp({ controllers: [TestErrorsController] });
  });

  afterAll(async () => {
    await t.close();
  });

  describe('CA-2 health', () => {
    it('responde 200 con la base de datos disponible', async () => {
      const res = await t.http.get('/api/v1/health').expect(200);
      expect(res.body).toEqual({ status: 'ok', db: 'ok' });
    });

    it('responde 503 Problem Details si la base de datos no responde', async () => {
      const down = await createTestApp({
        env: { DATABASE_URL: 'postgres://app_runtime:x@127.0.0.1:1/anderp' },
      });
      try {
        const res = await down.http.get('/api/v1/health').expect(503);
        expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
        expect(res.body).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
      } finally {
        await down.close();
      }
    });
  });

  it('CA-5 ruta inexistente → 404 Problem Details', async () => {
    const res = await t.http.get('/api/v1/does-not-exist').expect(404);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('CA-6 error no controlado → 500 con requestId y log sin secretos', async () => {
    const res = await t.http
      .post('/api/v1/test/boom')
      .set('Authorization', 'Bearer secret-token-123')
      .set('Cookie', 'anderp_rt=secret-cookie-456')
      .send({ password: 'secret-pass-789' })
      .expect(500);

    expect(res.body).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
    const requestId = res.body.requestId as string;
    expect(requestId).toBe(res.headers['x-request-id']);

    const logs = t.logs.join('\n');
    const errorLog = t.logs
      .map((line) => JSON.parse(line) as LogEntry)
      .find((entry) => entry.msg === 'Unhandled error' && entry.err?.message === 'boom');
    expect(errorLog?.req?.id).toBe(requestId);
    expect(logs).not.toContain('secret-token-123');
    expect(logs).not.toContain('secret-cookie-456');
    expect(logs).not.toContain('secret-pass-789');
  });

  it('CA-7 cuerpo inválido → 422 VALIDATION_ERROR con errores por campo', async () => {
    const res = await t.http.post('/api/v1/test/things').send({ name: '', amount: 100 }).expect(422);
    expect(res.body).toMatchObject({ status: 422, code: 'VALIDATION_ERROR' });
    const paths = (res.body.errors as { path: string }[]).map((e) => e.path).sort();
    expect(paths).toEqual(['amount', 'name']);
  });

  it('acepta un cuerpo válido', async () => {
    const body = { name: 'Papelería', amount: '150000.00' };
    const res = await t.http.post('/api/v1/test/things').send(body).expect(201);
    expect(res.body).toEqual(body);
  });

  it('DomainError → su status y code', async () => {
    const res = await t.http.get('/api/v1/test/domain-error').expect(409);
    expect(res.body).toMatchObject({
      code: 'THING_ALREADY_EXISTS',
      detail: 'The thing already exists',
    });
  });

  it('excepción de trigger (P0001) a través de Drizzle → 422 con el code del mensaje', async () => {
    const res = await t.http.get('/api/v1/test/trigger-error').expect(422);
    expect(res.body).toMatchObject({ status: 422, code: 'TEST_TRIGGER_CODE' });
  });

  describe('x-request-id', () => {
    it('respeta un id entrante con forma segura', async () => {
      const res = await t.http.get('/api/v1/health').set('x-request-id', 'client-req-12345');
      expect(res.headers['x-request-id']).toBe('client-req-12345');
    });

    it('reemplaza un id entrante inseguro', async () => {
      const res = await t.http.get('/api/v1/health').set('x-request-id', 'bad id" forged="1');
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it('publica la documentación OpenAPI fuera de producción', async () => {
    const res = await t.http.get('/api/docs-json').expect(200);
    expect(res.body.info.title).toBe('AndERP API');
  });
});

describe('CA-8 migración base', () => {
  it('crea las extensiones en `extensions` y los enums en `anderp`', async () => {
    await withOwnerSql(async (sql) => {
      const extensions = await sql<{ extname: string; schema: string }[]>`
        select extname, extnamespace::regnamespace::text as schema
        from pg_extension where extname in ('citext', 'btree_gist') order by extname`;
      expect(extensions).toEqual([
        { extname: 'btree_gist', schema: 'extensions' },
        { extname: 'citext', schema: 'extensions' },
      ]);

      const enums = await sql<{ typname: string }[]>`
        select typname from pg_type
        where typnamespace = 'anderp'::regnamespace and typtype = 'e' order by typname`;
      expect(enums.map((e) => e.typname)).toEqual([
        'member_role',
        'organization_status',
        'payment_frequency',
        'user_status',
      ]);
    });
  });

  it('app_runtime no puede crear tablas y usa el search_path correcto', async () => {
    await withRuntimeSql(async (sql) => {
      await expect(sql`create table anderp.should_fail (x int)`).rejects.toThrow(
        /permission denied/,
      );
      await expect(sql`create table public.should_fail (x int)`).rejects.toThrow(
        /permission denied/,
      );
      const [row] = await sql<{ path: string }[]>`select current_setting('search_path') as path`;
      expect(row?.path).toBe('anderp, extensions');
    });
  });

  it('app_runtime recibe permisos DML sobre las tablas nuevas de `anderp`', async () => {
    await withOwnerSql((sql) => sql`create table anderp.privileges_probe (x int)`);
    try {
      await withRuntimeSql(async (sql) => {
        await sql`insert into privileges_probe values (1)`;
        await sql`update privileges_probe set x = 2`;
        const rows = await sql`select x from privileges_probe`;
        expect(rows).toEqual([{ x: 2 }]);
        await sql`delete from privileges_probe`;
      });
    } finally {
      await withOwnerSql((sql) => sql`drop table anderp.privileges_probe`);
    }
  });
});
