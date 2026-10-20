import {
  type AirOperator,
  ErrorCode,
  type SaveAirOperator,
  type UpdateAirOperator,
} from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DB, type Database, type DbExecutor } from '../../db/database.module';
import { airOperators as o } from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';

const columns = { id: o.id, name: o.name, isActive: o.isActive };

const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);

/** Catálogo de operadores aéreos (F18 CA-1, CA-2). Sin auditoría, como el resto de los catálogos. */
@Injectable()
export class AirOperatorsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly scope: OrgScope,
  ) {}

  list(active?: boolean): Promise<AirOperator[]> {
    return this.db
      .select(columns)
      .from(o)
      .where(and(this.scope.where(o), active === undefined ? undefined : eq(o.isActive, active)))
      .orderBy(sql`lower(${o.name})`);
  }

  async get(id: string, db: DbExecutor = this.db): Promise<AirOperator> {
    const [row] = await db
      .select(columns)
      .from(o)
      .where(and(this.scope.where(o), eq(o.id, id)));
    if (!row) throw notFound();
    return row;
  }

  async create(input: SaveAirOperator): Promise<AirOperator> {
    const [row] = await this.db
      .insert(o)
      .values(this.scope.forInsert({ name: input.name }))
      .returning(columns);
    if (!row) throw new Error('Insert returned no rows');
    return row;
  }

  async update(id: string, changes: UpdateAirOperator): Promise<AirOperator> {
    const [row] = await this.db
      .update(o)
      .set(this.scope.forUpdate(changes))
      .where(and(this.scope.where(o), eq(o.id, id)))
      .returning(columns);
    if (!row) throw notFound();
    return row;
  }
}
