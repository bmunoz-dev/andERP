import {
  type Contract,
  type ContractOption,
  type CreateContract,
  ErrorCode,
  type UpdateContract,
} from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { DB, type Database, type DbExecutor } from '../../db/database.module';
import { contractMonthTotals, providerContracts, serviceProviders } from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit.service';
import { contractColumns, monthTotalsJoin, paidInMonthSql } from './contract-queries';
import { ServiceProvidersService } from './service-providers.service';

const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);

/** Datos del contrato que se guardan en la auditoría (antes/después). */
function auditable(c: Contract) {
  return {
    startDate: c.startDate,
    endDate: c.endDate,
    workAgreement: c.workAgreement,
    paymentFrequency: c.paymentFrequency,
    monthlyAmount: c.monthlyAmount,
    paymentMode: c.paymentMode,
  };
}

/**
 * Contratos de los prestadores (F03 CA-6 a CA-10). Que no se crucen lo garantiza la restricción
 * EXCLUDE de la base de datos; aquí se valida lo que conviene decir antes de escribir.
 */
@Injectable()
export class ContractsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly scope: OrgScope,
    private readonly providers: ServiceProvidersService,
  ) {}

  /** Del más reciente al más antiguo. */
  async listForProvider(providerId: string): Promise<Contract[]> {
    await this.providers.assertExists(providerId);
    return this.db
      .select(contractColumns(this.providers.today()))
      .from(providerContracts)
      .leftJoin(contractMonthTotals, monthTotalsJoin(this.providers.today()))
      .where(
        and(
          this.scope.where(providerContracts),
          eq(providerContracts.serviceProviderId, providerId),
        ),
      )
      .orderBy(desc(providerContracts.startDate));
  }

  /**
   * Contratos vigentes en algún día del rango (F04 CA-17): a quién se le puede pagar esa semana.
   * Con lo ya pagado en el mes de `start` (F10 CA-6), sin contar `excludePayment` si llega.
   */
  overlapping(start: string, end: string, excludePayment?: string): Promise<ContractOption[]> {
    return this.db
      .select({
        id: providerContracts.id,
        serviceProvider: { id: serviceProviders.id, name: serviceProviders.name },
        startDate: providerContracts.startDate,
        endDate: providerContracts.endDate,
        monthlyAmount: providerContracts.monthlyAmount,
        paymentMode: providerContracts.paymentMode,
        paidInMonth: paidInMonthSql(
          Number(start.slice(0, 4)),
          Number(start.slice(5, 7)),
          excludePayment,
        ),
      })
      .from(providerContracts)
      .innerJoin(
        serviceProviders,
        and(
          eq(serviceProviders.organizationId, providerContracts.organizationId),
          eq(serviceProviders.id, providerContracts.serviceProviderId),
        ),
      )
      .where(
        and(
          this.scope.where(providerContracts),
          lte(providerContracts.startDate, end),
          or(isNull(providerContracts.endDate), gte(providerContracts.endDate, start)),
        ),
      )
      .orderBy(asc(serviceProviders.name));
  }

  async get(id: string, db: DbExecutor = this.db): Promise<Contract> {
    const [row] = await db
      .select(contractColumns(this.providers.today()))
      .from(providerContracts)
      .leftJoin(contractMonthTotals, monthTotalsJoin(this.providers.today()))
      .where(and(this.scope.where(providerContracts), eq(providerContracts.id, id)));
    if (!row) throw notFound();
    return row;
  }

  async create(providerId: string, input: CreateContract): Promise<Contract> {
    await this.providers.assertExists(providerId);
    assertDateRange(input.startDate, input.endDate ?? null);

    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(providerContracts)
        .values(
          this.scope.forInsert({
            serviceProviderId: providerId,
            startDate: input.startDate,
            endDate: input.endDate ?? null,
            workAgreement: input.workAgreement,
            paymentFrequency: input.paymentFrequency,
            monthlyAmount: input.monthlyAmount,
            ...(input.paymentMode !== undefined ? { paymentMode: input.paymentMode } : {}),
          }),
        )
        .returning({ id: providerContracts.id });
      if (!row) throw new Error('Insert returned no rows');

      const contract = await this.get(row.id, tx);
      await this.audit.log(
        {
          action: 'contract.create',
          entityType: 'provider_contract',
          entityId: contract.id,
          changes: { after: auditable(contract) },
        },
        tx,
      );
      return contract;
    });
  }

  async update(id: string, changes: UpdateContract): Promise<Contract> {
    return this.db.transaction(async (tx) => {
      const before = await this.get(id, tx);
      assertDateRange(
        changes.startDate ?? before.startDate,
        changes.endDate !== undefined ? changes.endDate : before.endDate,
      );

      await tx
        .update(providerContracts)
        .set(
          this.scope.forUpdate({
            ...(changes.startDate !== undefined ? { startDate: changes.startDate } : {}),
            ...(changes.endDate !== undefined ? { endDate: changes.endDate } : {}),
            ...(changes.workAgreement !== undefined
              ? { workAgreement: changes.workAgreement }
              : {}),
            ...(changes.paymentFrequency !== undefined
              ? { paymentFrequency: changes.paymentFrequency }
              : {}),
            ...(changes.monthlyAmount !== undefined
              ? { monthlyAmount: changes.monthlyAmount }
              : {}),
            // F16 CA-3: con pagos, el trigger `provider_contracts_protect_payments` lo rechaza.
            ...(changes.paymentMode !== undefined ? { paymentMode: changes.paymentMode } : {}),
          }),
        )
        .where(and(this.scope.where(providerContracts), eq(providerContracts.id, id)));

      const after = await this.get(id, tx);
      await this.audit.log(
        {
          action: 'contract.update',
          entityType: 'provider_contract',
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
        .update(providerContracts)
        .set(this.scope.forSoftDelete())
        .where(and(this.scope.where(providerContracts), eq(providerContracts.id, id)))
        .returning({ id: providerContracts.id });
      if (!row) throw notFound();
      await this.audit.log(
        {
          action: 'contract.delete',
          entityType: 'provider_contract',
          entityId: id,
          changes: { before: auditable(before) },
        },
        tx,
      );
    });
  }
}

/** La fecha de fin no puede ser anterior al inicio (CA-6). La base de datos también lo exige. */
function assertDateRange(startDate: string, endDate: string | null): void {
  if (endDate !== null && endDate < startDate) {
    throw new DomainError(ErrorCode.INVALID_DATE_RANGE, 422);
  }
}
