import {
  type CatalogItem,
  type CatalogKind,
  createCatalogItemSchema,
  ErrorCode,
  updateCatalogItemSchema,
} from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { ZodValidationException } from 'nestjs-zod';
import { DB, type Database } from '../../db/database.module';
import { accountTypes, banks, documentTypes } from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';

type CatalogTable = typeof banks | typeof accountTypes | typeof documentTypes;

const TABLES: Record<CatalogKind, CatalogTable> = {
  banks,
  'account-types': accountTypes,
  'document-types': documentTypes,
};

function parse<T>(
  schema: {
    safeParse(v: unknown): { success: true; data: T } | { success: false; error: unknown };
  },
  body: unknown,
): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new ZodValidationException(result.error);
  return result.data;
}

/**
 * Bancos, tipos de cuenta y tipos de documento (design.md §5.4). Son globales: sin
 * `organization_id`. Los lee cualquier usuario y solo los modifica el super admin.
 */
@Injectable()
export class GlobalCatalogsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly scope: OrgScope,
  ) {}

  async list(kind: CatalogKind, includeInactive: boolean): Promise<CatalogItem[]> {
    const table = TABLES[kind];
    const rows = await this.db
      .select(this.columns(kind))
      .from(table)
      .where(and(isNull(table.deletedAt), includeInactive ? undefined : eq(table.isActive, true)))
      .orderBy(asc(table.name));
    return rows;
  }

  async create(kind: CatalogKind, body: unknown): Promise<CatalogItem> {
    const values = parse(createCatalogItemSchema(kind), body);
    const author = { createdBy: this.scope.userId, updatedBy: this.scope.userId };
    const table = TABLES[kind];
    const [row] = await this.db
      .insert(table)
      .values({ ...values, ...author } as typeof documentTypes.$inferInsert)
      .returning(this.columns(kind));
    if (!row) throw new Error('Insert returned no rows');
    return row;
  }

  async update(kind: CatalogKind, id: string, body: unknown): Promise<CatalogItem> {
    const values = parse(updateCatalogItemSchema(kind), body);
    const table = TABLES[kind];
    const [row] = await this.db
      .update(table)
      .set({ ...values, updatedAt: new Date(), updatedBy: this.scope.userId })
      .where(and(eq(table.id, id), isNull(table.deletedAt)))
      .returning(this.columns(kind));
    if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    return row;
  }

  /** `true` si el valor existe y está activo (F03 lo usa para validar altas nuevas). */
  async isActive(kind: CatalogKind, id: string): Promise<boolean> {
    const table = TABLES[kind];
    const [row] = await this.db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, id), eq(table.isActive, true), isNull(table.deletedAt)));
    return row !== undefined;
  }

  private columns(kind: CatalogKind) {
    const table = TABLES[kind];
    return {
      id: table.id,
      code: kind === 'document-types' ? documentTypes.code : sql<string | null>`null`,
      name: table.name,
      isActive: table.isActive,
    };
  }
}
