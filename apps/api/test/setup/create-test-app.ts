import type { INestApplication, Type } from '@nestjs/common';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { loadEnv } from '../../src/config/env';
import { configureApp } from '../../src/configure-app';

export interface TestApp {
  app: INestApplication;
  http: ReturnType<typeof request>;
  /** Líneas de log (JSON) emitidas por la app durante la prueba. */
  logs: string[];
  close(): Promise<void>;
}

export interface TestAppOptions {
  /** Controladores extra solo para pruebas (p. ej. rutas que lanzan errores). */
  controllers?: Type[];
  env?: Record<string, string>;
}

/** Crea la app completa, configurada igual que en `main.ts`, contra el Postgres de pruebas. */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const logs: string[] = [];
  const logStream = { write: (line: string) => void logs.push(line) };

  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
    DATABASE_URL: inject('databaseUrl'),
    ...options.env,
  });

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ env, logStream })],
    controllers: options.controllers ?? [],
  }).compile();

  const app = moduleRef.createNestApplication({ bufferLogs: true });
  configureApp(app, env);
  await app.init();

  return {
    app,
    http: request(app.getHttpServer() as Server),
    logs,
    close: () => app.close(),
  };
}
