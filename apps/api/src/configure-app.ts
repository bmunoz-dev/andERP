import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { Env } from './config/env';
import { requestIdMiddleware } from './shared/http/request-id';

export const API_PREFIX = 'api/v1';

/** Configuración común de `main.ts` y de las pruebas, para que ambos corran la misma app. */
export function configureApp(app: INestApplication, env: Env): void {
  app.useLogger(app.get(Logger));
  app.use(requestIdMiddleware);
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('AndERP API')
      .setVersion('1')
      .addBearerAuth()
      .build();
    const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
    SwaggerModule.setup('api/docs', app, document);
  }
}
