import {
  type CreateExpenseCategory,
  ErrorCode,
  type ExpenseCategory,
  type UpdateExpenseCategory,
} from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, max } from 'drizzle-orm';
import { DB, type Database } from '../../db/database.module';
import { expenseCategories } from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';

const columns = {
  id: expenseCategories.id,
  name: expenseCategories.name,
  systemCode: expenseCategories.systemCode,
  isActive: expenseCategories.isActive,
  sortOrder: expenseCategories.sortOrder,
};

const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);

/**
 * Categorías de egreso de la organización del actor (F02 CA-7 a CA-10). La protección de la
 * categoría de sistema vive en un trigger; aquí solo se traduce su error.
 */
@Injectable()
export class ExpenseCategoriesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly scope: OrgScope,
  ) {}

  list(): Promise<ExpenseCategory[]> {
    return this.db
      .select(columns)
      .from(expenseCategories)
      .where(this.scope.where(expenseCategories))
      .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name));
  }

  async create({ name }: CreateExpenseCategory): Promise<ExpenseCategory> {
    const [last] = await this.db
      .select({ value: max(expenseCategories.sortOrder) })
      .from(expenseCategories)
      .where(this.scope.where(expenseCategories));
    const [row] = await this.db
      .insert(expenseCategories)
      .values(this.scope.forInsert({ name, sortOrder: (last?.value ?? 0) + 1 }))
      .returning(columns);
    if (!row) throw new Error('Insert returned no rows');
    return row;
  }

  async update(id: string, changes: UpdateExpenseCategory): Promise<ExpenseCategory> {
    const [row] = await this.db
      .update(expenseCategories)
      .set(this.scope.forUpdate(changes))
      .where(and(this.scope.where(expenseCategories), eq(expenseCategories.id, id)))
      .returning(columns);
    if (!row) throw notFound();
    return row;
  }

  async remove(id: string): Promise<void> {
    const rows = await this.db
      .update(expenseCategories)
      .set(this.scope.forSoftDelete())
      .where(and(this.scope.where(expenseCategories), eq(expenseCategories.id, id)))
      .returning({ id: expenseCategories.id });
    if (rows.length === 0) throw notFound();
  }

  /** Recibe TODAS las categorías vigentes en el orden nuevo (F02 CA-9). */
  async reorder(ids: string[]): Promise<ExpenseCategory[]> {
    await this.db.transaction(async (tx) => {
      const current = await tx
        .select({ id: expenseCategories.id })
        .from(expenseCategories)
        .where(this.scope.where(expenseCategories));
      const expected = new Set(current.map((c) => c.id));
      if (
        ids.length !== expected.size ||
        new Set(ids).size !== ids.length ||
        !ids.every((id) => expected.has(id))
      ) {
        throw new DomainError(
          ErrorCode.INVALID_CATEGORY_ORDER,
          422,
          'ids must list every category exactly once',
        );
      }
      for (const [index, id] of ids.entries()) {
        await tx
          .update(expenseCategories)
          .set(this.scope.forUpdate({ sortOrder: index + 1 }))
          .where(and(this.scope.where(expenseCategories), eq(expenseCategories.id, id)));
      }
    });
    return this.list();
  }
}
