import {
  type DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ENV, type Env } from '../config/env';
import { OrgScope } from '../shared/db/org-scope';
import * as schema from './schema';

export const SQL = Symbol('SQL');
export const DB = Symbol('DB');

export type Sql = postgres.Sql;
export type Database = PostgresJsDatabase<typeof schema>;
/** Transacción de Drizzle; `DbExecutor` acepta la conexión o una transacción en curso. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbExecutor = Database | Tx;

@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(SQL) private readonly sql: Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: SQL,
          inject: [ENV],
          useFactory: (env: Env): Sql =>
            postgres(env.DATABASE_URL, {
              max: 10,
              idle_timeout: 20,
              connect_timeout: 10,
              onnotice: () => undefined,
            }),
        },
        {
          provide: DB,
          inject: [SQL],
          useFactory: (sql: Sql): Database => drizzle(sql, { schema, casing: 'snake_case' }),
        },
        DatabaseLifecycle,
        OrgScope,
      ],
      exports: [SQL, DB, OrgScope],
    };
  }
}
