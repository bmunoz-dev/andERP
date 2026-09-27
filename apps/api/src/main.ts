import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = loadEnv(process.env);

  const app = await NestFactory.create(AppModule.register({ env }), { bufferLogs: true });
  configureApp(app, env);
  await app.listen(env.PORT);
}

void bootstrap();
