import { ErrorCode, type Expense, type SaveExpense, type UpdateExpense } from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Database, type DbExecutor } from '../../db/database.module';
import { expenseCategories, expenses } from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit.service';

const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);

const columns = {
  id: expenses.id,
  categoryId: expenses.categoryId,
  concept: expenses.concept,
  invoiceNumber: expenses.invoiceNumber,
  paymentDate: expenses.paymentDate,
  weekOfMonth: expenses.weekOfMonth,
  amount: expenses.amount,
};

const auditable = ({ id: _id, ...rest }: Expense) => rest;

/**
 * Egresos manuales (F05 CA-1 a CA-6). Que no vayan en "Honorarios" lo exige el trigger
 * `expenses_reject_fees_category` (mismo `code`); aquí se valida que la categoría esté activa.
 */
@Injectable()
export class ExpensesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly scope: OrgScope,
  ) {}

  async get(id: string, db: DbExecutor = this.db): Promise<Expense> {
    const [row] = await db
      .select(columns)
      .from(expenses)
      .where(and(this.scope.where(expenses), eq(expenses.id, id)));
    if (!row) throw notFound();
    return row;
  }

  async create(input: SaveExpense): Promise<Expense> {
    await this.assertCategoryActive(input.categoryId);
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(expenses)
        .values(
          this.scope.forInsert({
            categoryId: input.categoryId,
            concept: input.concept,
            invoiceNumber: input.invoiceNumber ?? null,
            paymentDate: input.paymentDate,
            amount: input.amount,
          }),
        )
        .returning(columns);
      if (!row) throw new Error('Insert returned no rows');
      await this.audit.log(
        {
          action: 'expense.create',
          entityType: 'expense',
          entityId: row.id,
          changes: { after: auditable(row) },
        },
        tx,
      );
      return row;
    });
  }

  async update(id: string, changes: UpdateExpense): Promise<Expense> {
    return this.db.transaction(async (tx) => {
      const before = await this.get(id, tx);
      if (changes.categoryId !== undefined && changes.categoryId !== before.categoryId) {
        await this.assertCategoryActive(changes.categoryId);
      }
      const [after] = await tx
        .update(expenses)
        .set(
          this.scope.forUpdate({
            ...(changes.categoryId !== undefined ? { categoryId: changes.categoryId } : {}),
            ...(changes.concept !== undefined ? { concept: changes.concept } : {}),
            ...(changes.invoiceNumber !== undefined
              ? { invoiceNumber: changes.invoiceNumber }
              : {}),
            ...(changes.paymentDate !== undefined ? { paymentDate: changes.paymentDate } : {}),
            ...(changes.amount !== undefined ? { amount: changes.amount } : {}),
          }),
        )
        .where(and(this.scope.where(expenses), eq(expenses.id, id)))
        .returning(columns);
      if (!after) throw notFound();
      await this.audit.log(
        {
          action: 'expense.update',
          entityType: 'expense',
          entityId: id,
          changes: { before: auditable(before), after: auditable(after) },
        },
        tx,
      );
      return after;
    });
  }

  async remove(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const before = await this.get(id, tx);
      // Si otro borrado confirmó primero, la fila ya no cumple el WHERE: 404 y sin auditoría.
      const [row] = await tx
        .update(expenses)
        .set(this.scope.forSoftDelete())
        .where(and(this.scope.where(expenses), eq(expenses.id, id)))
        .returning({ id: expenses.id });
      if (!row) throw notFound();
      await this.audit.log(
        {
          action: 'expense.delete',
          entityType: 'expense',
          entityId: id,
          changes: { before: auditable(before) },
        },
        tx,
      );
    });
  }

  /** 404 si la categoría no es de la organización; 422 si está inactiva (CA-3). */
  private async assertCategoryActive(categoryId: string): Promise<void> {
    const [category] = await this.db
      .select({ isActive: expenseCategories.isActive })
      .from(expenseCategories)
      .where(and(this.scope.where(expenseCategories), eq(expenseCategories.id, categoryId)));
    if (!category) throw notFound();
    if (!category.isActive) throw new DomainError(ErrorCode.INACTIVE_CATEGORY, 422);
  }
}
