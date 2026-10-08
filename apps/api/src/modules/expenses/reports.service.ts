import {
  daysInMonth,
  formatIsoDate,
  type LedgerEntry,
  type MonthlyMatrix,
  WEEKS_OF_MONTH,
  weekRange,
} from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, between, eq, isNull, type SQL, sql } from 'drizzle-orm';
import { DB, type Database } from '../../db/database.module';
import { expenseCategories, expenseLedger } from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';

function monthRange(year: number, month: number): { start: string; end: string } {
  return {
    start: formatIsoDate({ year, month, day: 1 }),
    end: formatIsoDate({ year, month, day: daysInMonth(year, month) }),
  };
}

interface Aggregate {
  categoryId: string | null;
  week: number | null;
  amount: string;
}

/** Matriz mensual y libro de egresos (F05 CA-8 a CA-12). Las sumas salen todas de SQL. */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly scope: OrgScope,
  ) {}

  /** Filtro por rango de `payment_date` (usa el índice) y por la organización del actor. */
  private inMonth(year: number, month: number): SQL {
    const { start, end } = monthRange(year, month);
    const condition = and(
      eq(expenseLedger.organizationId, this.scope.organizationId),
      between(expenseLedger.paymentDate, start, end),
    );
    if (!condition) throw new Error('Unreachable');
    return condition;
  }

  async monthly(year: number, month: number): Promise<MonthlyMatrix> {
    // Una sola consulta da celdas, totales por categoría, por semana y el total del mes.
    const result = await this.db.execute<{
      category_id: string | null;
      week: number | null;
      amount: string;
    }>(sql`
      select ${expenseLedger.categoryId} as category_id,
             ${expenseLedger.weekOfMonth} as week,
             sum(${expenseLedger.amount})::numeric(14, 2)::text as amount
        from ${expenseLedger}
       where ${this.inMonth(year, month)}
       group by grouping sets ((${expenseLedger.categoryId}, ${expenseLedger.weekOfMonth}),
                               (${expenseLedger.categoryId}), (${expenseLedger.weekOfMonth}), ())`);
    const sums: Aggregate[] = [...result].map((r) => ({
      categoryId: r.category_id,
      week: r.week,
      amount: r.amount,
    }));
    const find = (categoryId: string | null, week: number | null) =>
      sums.find((s) => s.categoryId === categoryId && s.week === week)?.amount ?? '0.00';

    const categories = await this.db
      .select({
        id: expenseCategories.id,
        name: expenseCategories.name,
        systemCode: expenseCategories.systemCode,
        isActive: expenseCategories.isActive,
      })
      .from(expenseCategories)
      .where(
        and(
          eq(expenseCategories.organizationId, this.scope.organizationId),
          isNull(expenseCategories.deletedAt),
        ),
      )
      .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name));

    const withAmounts = new Set(
      sums.filter((s) => s.categoryId && s.week === null).map((s) => s.categoryId),
    );
    return {
      year,
      month,
      weeks: WEEKS_OF_MONTH.map((week) => ({ week, ...weekRange(year, month, week) })),
      // Las activas siempre; las inactivas solo si tienen movimientos ese mes.
      rows: categories
        .filter((c) => c.isActive || withAmounts.has(c.id))
        .map((c) => ({
          categoryId: c.id,
          name: c.name,
          isSystem: c.systemCode !== null,
          isActive: c.isActive,
          cells: WEEKS_OF_MONTH.map((week) => find(c.id, week)),
          total: find(c.id, null),
        })),
      weekTotals: WEEKS_OF_MONTH.map((week) => find(null, week)),
      grandTotal: find(null, null),
    };
  }

  ledger(
    year: number,
    month: number,
    filters: { categoryId?: string; week?: number },
  ): Promise<LedgerEntry[]> {
    return this.db
      .select({
        source: expenseLedger.source,
        sourceId: expenseLedger.sourceId,
        categoryId: expenseLedger.categoryId,
        concept: expenseLedger.concept,
        invoiceNumber: expenseLedger.invoiceNumber,
        paymentDate: expenseLedger.paymentDate,
        weekOfMonth: expenseLedger.weekOfMonth,
        amount: expenseLedger.amount,
      })
      .from(expenseLedger)
      .where(
        and(
          this.inMonth(year, month),
          filters.categoryId ? eq(expenseLedger.categoryId, filters.categoryId) : undefined,
          filters.week ? eq(expenseLedger.weekOfMonth, filters.week) : undefined,
        ),
      )
      .orderBy(asc(expenseLedger.paymentDate), asc(expenseLedger.concept));
  }
}
