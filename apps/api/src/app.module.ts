import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import type { DestinationStream } from 'pino';
import { ENV, type Env } from './config/env';
import { DatabaseModule } from './db/database.module';
import { HealthController } from './modules/health/health.controller';
import { RequestContextModule } from './shared/context/request-context';
import { ProblemDetailsFilter } from './shared/errors/problem-details.filter';
import { createLoggerModule } from './shared/logging/logger.module';

export interface AppModuleOptions {
  env: Env;
  /** Destino alternativo de los logs (las pruebas lo usan para inspeccionarlos). */
  logStream?: DestinationStream;
}

@Module({})
export class AppModule {
  static register({ env, logStream }: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [createLoggerModule(env, logStream), RequestContextModule, DatabaseModule.forRoot()],
      controllers: [HealthController],
      providers: [
        { provide: ENV, useValue: env },
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
      ],
      exports: [ENV],
    };
  }
}
