import type { INestApplication, Type } from '@nestjs/common';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { loadEnv } from '../../src/config/env';
import { configureApp } from '../../src/configure-app';
import { MAILER } from '../../src/modules/mail/mailer';
import { FakeMailer } from '../../src/modules/auth/application/testing/in-memory-auth';

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  /** Líneas de log (JSON) emitidas por la app durante la prueba. */
  logs: string[];
  /** Bandeja de correo en memoria (reemplaza al SMTP). */
  mailer: FakeMailer;
  close(): Promise<void>;
}

export interface TestAppOptions {
  /** Controladores extra solo para pruebas (p. ej. rutas que lanzan errores). */
  controllers?: Type[];
  env?: Record<string, string>;
}

export const TEST_ENV = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'info',
  JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
  WEB_URL: 'http://localhost:5173',
  // Alto para que las pruebas que inician sesión muchas veces no choquen con el límite.
  AUTH_THROTTLE_LIMIT: '1000',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'AndERP <no-reply@anderp.test>',
};

/** Crea la app completa, configurada igual que en `main.ts`, contra el Postgres de pruebas. */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const logs: string[] = [];
  const logStream = { write: (line: string) => void logs.push(line) };
  const mailer = new FakeMailer();

  const env = loadEnv({ ...TEST_ENV, DATABASE_URL: inject('databaseUrl'), ...options.env });

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ env, logStream })],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(MAILER)
    .useValue(mailer)
    .compile();

  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app, env);
  await app.init();

  return {
    app,
    http: request(app.getHttpServer() as Server),
    logs,
    mailer,
    close: () => app.close(),
  };
}
