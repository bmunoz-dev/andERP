import { ErrorCode, type FeePayment, type SaveFeePayment } from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { DB, type Database, type DbExecutor } from '../../db/database.module';
import {
  feePaymentDays,
  feePaymentTotals,
  feePayments,
  providerContracts,
  serviceProviders,
} from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit.service';
import { assertValidDays } from './fee-payment-rules';

export interface FeePaymentFilters {
  periodYear?: number;
  periodMonth?: number;
  weekOfMonth?: number;
  serviceProviderId?: string;
}

const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);

/** Lo que queda en la auditoría: cabecera y días (nada secreto). */
function auditable(p: FeePayment) {
  return { paymentDate: p.paymentDate, notes: p.notes, total: p.total, days: p.days };
}

/**
 * Pagos semanales de honorarios (F04). Las invariantes que no requieren la base de datos están en
 * `assertValidDays`; las que sí (día dentro del contrato, periodo inmutable, contrato con pagos)
 * las exigen triggers que responden con el mismo `code`.
 */
@Injectable()
export class FeePaymentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly scope: OrgScope,
  ) {}

  async list(filters: FeePaymentFilters = {}): Promise<FeePayment[]> {
    const conditions: (SQL | undefined)[] = [
      filters.periodYear !== undefined ? eq(feePayments.periodYear, filters.periodYear) : undefined,
      filters.periodMonth !== undefined
        ? eq(feePayments.periodMonth, filters.periodMonth)
        : undefined,
      filters.weekOfMonth !== undefined
        ? eq(feePayments.weekOfMonth, filters.weekOfMonth)
        : undefined,
      filters.serviceProviderId ? eq(serviceProviders.id, filters.serviceProviderId) : undefined,
    ];
    return this.load(this.db, conditions);
  }

  async get(id: string, db: DbExecutor = this.db): Promise<FeePayment> {
    const [payment] = await this.load(db, [eq(feePayments.id, id)]);
    if (!payment) throw notFound();
    return payment;
  }

  async create(input: SaveFeePayment): Promise<FeePayment> {
    assertValidDays(input, input.days);

    const payment = await this.db.transaction(async (tx) => {
      await this.lockContract(tx, input.contractId);
      const [row] = await tx
        .insert(feePayments)
        .values(
          this.scope.forInsert({
            contractId: input.contractId,
            periodYear: input.periodYear,
            periodMonth: input.periodMonth,
            weekOfMonth: input.weekOfMonth,
            paymentDate: input.paymentDate,
            notes: input.notes ?? null,
          }),
        )
        .returning({ id: feePayments.id });
      if (!row) throw new Error('Insert returned no rows');
      await this.insertDays(tx, row.id, input);
      return this.get(row.id, tx);
    });

    await this.audit.log({
      action: 'fee_payment.create',
      entityType: 'fee_payment',
      entityId: payment.id,
      changes: { after: auditable(payment) },
    });
    return payment;
  }

  /** Reemplaza fecha de pago, notas y días. Contrato y periodo no cambian (CA-11). */
  async update(id: string, input: SaveFeePayment): Promise<FeePayment> {
    const before = await this.get(id);
    if (
      input.contractId !== before.contractId ||
      input.periodYear !== before.periodYear ||
      input.periodMonth !== before.periodMonth ||
      input.weekOfMonth !== before.weekOfMonth
    ) {
      throw new DomainError(ErrorCode.FEE_PAYMENT_PERIOD_IMMUTABLE, 422);
    }
    assertValidDays(input, input.days);

    const after = await this.db.transaction(async (tx) => {
      await this.lockContract(tx, before.contractId);
      await tx
        .update(feePayments)
        .set(this.scope.forUpdate({ paymentDate: input.paymentDate, notes: input.notes ?? null }))
        .where(and(this.scope.where(feePayments), eq(feePayments.id, id)));
      await tx.delete(feePaymentDays).where(eq(feePaymentDays.feePaymentId, id));
      await this.insertDays(tx, id, input);
      return this.get(id, tx);
    });

    await this.audit.log({
      action: 'fee_payment.update',
      entityType: 'fee_payment',
      entityId: id,
      changes: { before: auditable(before), after: auditable(after) },
    });
    return after;
  }

  async remove(id: string): Promise<void> {
    const before = await this.get(id);
    await this.db
      .update(feePayments)
      .set(this.scope.forSoftDelete())
      .where(and(this.scope.where(feePayments), eq(feePayments.id, id)));
    await this.audit.log({
      action: 'fee_payment.delete',
      entityType: 'fee_payment',
      entityId: id,
      changes: { before: auditable(before) },
    });
  }

  /**
   * Bloquea la fila del contrato hasta el fin de la transacción (404 si no es de la organización).
   * Así dos pagos simultáneos del mismo contrato se serializan, y el trigger diferido
   * `fee_payment_days_check_balance` ve lo pagado por el otro: juntos no superan el total (CA-9).
   */
  private async lockContract(tx: DbExecutor, contractId: string): Promise<void> {
    const [contract] = await tx
      .select({ id: providerContracts.id })
      .from(providerContracts)
      .where(and(this.scope.where(providerContracts), eq(providerContracts.id, contractId)))
      .for('update');
    if (!contract) throw notFound();
  }

  private async insertDays(tx: DbExecutor, feePaymentId: string, input: SaveFeePayment) {
    await tx.insert(feePaymentDays).values(
      input.days.map((day) => ({
        organizationId: this.scope.organizationId,
        feePaymentId,
        workDate: day.workDate,
        amount: day.amount,
        isHoliday: day.isHoliday,
      })),
    );
  }

  /** Cabeceras con prestador y total (de la vista) y sus días, en dos consultas. */
  private async load(db: DbExecutor, conditions: (SQL | undefined)[]): Promise<FeePayment[]> {
    const headers = await db
      .select({
        id: feePayments.id,
        contractId: feePayments.contractId,
        serviceProvider: { id: serviceProviders.id, name: serviceProviders.name },
        periodYear: feePayments.periodYear,
        periodMonth: feePayments.periodMonth,
        weekOfMonth: feePayments.weekOfMonth,
        periodStart: feePayments.periodStart,
        periodEnd: feePayments.periodEnd,
        paymentDate: feePayments.paymentDate,
        notes: feePayments.notes,
        total: feePaymentTotals.totalAmount,
      })
      .from(feePayments)
      .innerJoin(feePaymentTotals, eq(feePaymentTotals.feePaymentId, feePayments.id))
      .innerJoin(
        providerContracts,
        and(
          eq(providerContracts.organizationId, feePayments.organizationId),
          eq(providerContracts.id, feePayments.contractId),
        ),
      )
      .innerJoin(
        serviceProviders,
        and(
          eq(serviceProviders.organizationId, providerContracts.organizationId),
          eq(serviceProviders.id, providerContracts.serviceProviderId),
        ),
      )
      .where(and(this.scope.where(feePayments), ...conditions))
      .orderBy(desc(feePayments.periodStart), asc(serviceProviders.name));

    const ids = headers.map((h) => h.id);
    const days =
      ids.length === 0
        ? []
        : await db
            .select({
              feePaymentId: feePaymentDays.feePaymentId,
              workDate: feePaymentDays.workDate,
              amount: feePaymentDays.amount,
              isHoliday: feePaymentDays.isHoliday,
            })
            .from(feePaymentDays)
            .where(inArray(feePaymentDays.feePaymentId, ids))
            .orderBy(asc(feePaymentDays.workDate));

    return headers.map((h) => ({
      ...h,
      days: days
        .filter((d) => d.feePaymentId === h.id)
        .map(({ workDate, amount, isHoliday }) => ({ workDate, amount, isHoliday })),
    }));
  }
}
