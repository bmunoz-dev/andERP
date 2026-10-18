import {
  ErrorCode,
  type FixedPayment,
  type SaveFixedPayment,
  type UpdateFixedPayment,
} from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, type SQL } from 'drizzle-orm';
import { DB, type Database, type DbExecutor } from '../../db/database.module';
import { fixedPayments, providerContracts, serviceProviders } from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit.service';

export interface FixedPaymentFilters {
  periodYear?: number;
  periodMonth?: number;
  serviceProviderId?: string;
}

const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);

function auditable(p: FixedPayment) {
  return { paymentDate: p.paymentDate, amount: p.amount, notes: p.notes };
}

/**
 * Pagos de monto fijo (F16). Forma de pago del contrato, mes dentro del contrato y periodo
 * inmutable los exige el trigger `fixed_payments_validate`, que responde con el `code`.
 */
@Injectable()
export class FixedPaymentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly scope: OrgScope,
  ) {}

  list(filters: FixedPaymentFilters = {}): Promise<FixedPayment[]> {
    return this.load(this.db, [
      filters.periodYear !== undefined
        ? eq(fixedPayments.periodYear, filters.periodYear)
        : undefined,
      filters.periodMonth !== undefined
        ? eq(fixedPayments.periodMonth, filters.periodMonth)
        : undefined,
      filters.serviceProviderId ? eq(serviceProviders.id, filters.serviceProviderId) : undefined,
    ]);
  }

  async get(id: string, db: DbExecutor = this.db): Promise<FixedPayment> {
    const [payment] = await this.load(db, [eq(fixedPayments.id, id)]);
    if (!payment) throw notFound();
    return payment;
  }

  async create(input: SaveFixedPayment): Promise<FixedPayment> {
    return this.db.transaction(async (tx) => {
      // 404 si el contrato es de otra organización (la FK compuesta respondería 422).
      const [contract] = await tx
        .select({ id: providerContracts.id })
        .from(providerContracts)
        .where(
          and(this.scope.where(providerContracts), eq(providerContracts.id, input.contractId)),
        );
      if (!contract) throw notFound();

      const [row] = await tx
        .insert(fixedPayments)
        .values(
          this.scope.forInsert({
            contractId: input.contractId,
            periodYear: input.periodYear,
            periodMonth: input.periodMonth,
            paymentDate: input.paymentDate,
            amount: input.amount,
            notes: input.notes ?? null,
          }),
        )
        .returning({ id: fixedPayments.id });
      if (!row) throw new Error('Insert returned no rows');
      const payment = await this.get(row.id, tx);
      await this.audit.log(
        {
          action: 'fixed_payment.create',
          entityType: 'fixed_payment',
          entityId: payment.id,
          changes: { after: auditable(payment) },
        },
        tx,
      );
      return payment;
    });
  }

  async update(id: string, changes: UpdateFixedPayment): Promise<FixedPayment> {
    return this.db.transaction(async (tx) => {
      const before = await this.get(id, tx);
      await tx
        .update(fixedPayments)
        .set(
          this.scope.forUpdate({
            ...(changes.paymentDate !== undefined ? { paymentDate: changes.paymentDate } : {}),
            ...(changes.amount !== undefined ? { amount: changes.amount } : {}),
            ...(changes.notes !== undefined ? { notes: changes.notes } : {}),
          }),
        )
        .where(and(this.scope.where(fixedPayments), eq(fixedPayments.id, id)));
      const after = await this.get(id, tx);
      await this.audit.log(
        {
          action: 'fixed_payment.update',
          entityType: 'fixed_payment',
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
        .update(fixedPayments)
        .set(this.scope.forSoftDelete())
        .where(and(this.scope.where(fixedPayments), eq(fixedPayments.id, id)))
        .returning({ id: fixedPayments.id });
      if (!row) throw notFound();
      await this.audit.log(
        {
          action: 'fixed_payment.delete',
          entityType: 'fixed_payment',
          entityId: id,
          changes: { before: auditable(before) },
        },
        tx,
      );
    });
  }

  private load(db: DbExecutor, conditions: (SQL | undefined)[]): Promise<FixedPayment[]> {
    return db
      .select({
        id: fixedPayments.id,
        contractId: fixedPayments.contractId,
        serviceProvider: { id: serviceProviders.id, name: serviceProviders.name },
        periodYear: fixedPayments.periodYear,
        periodMonth: fixedPayments.periodMonth,
        paymentDate: fixedPayments.paymentDate,
        amount: fixedPayments.amount,
        notes: fixedPayments.notes,
      })
      .from(fixedPayments)
      .innerJoin(
        providerContracts,
        and(
          eq(providerContracts.organizationId, fixedPayments.organizationId),
          eq(providerContracts.id, fixedPayments.contractId),
        ),
      )
      .innerJoin(
        serviceProviders,
        and(
          eq(serviceProviders.organizationId, providerContracts.organizationId),
          eq(serviceProviders.id, providerContracts.serviceProviderId),
        ),
      )
      .where(and(this.scope.where(fixedPayments), ...conditions))
      .orderBy(desc(fixedPayments.paymentDate), asc(serviceProviders.name));
  }
}
