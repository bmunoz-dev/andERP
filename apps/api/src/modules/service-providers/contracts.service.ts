import { type Contract, type CreateContract, ErrorCode, type UpdateContract } from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Database } from '../../db/database.module';
import { providerContracts } from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit.service';
import { contractColumns } from './contract-queries';
import { ServiceProvidersService } from './service-providers.service';

const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);

/** Datos del contrato que se guardan en la auditoría (antes/después). */
function auditable(c: Contract) {
  return {
    startDate: c.startDate,
    endDate: c.endDate,
    workAgreement: c.workAgreement,
    paymentFrequency: c.paymentFrequency,
    totalAmount: c.totalAmount,
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
      .where(
        and(
          this.scope.where(providerContracts),
          eq(providerContracts.serviceProviderId, providerId),
        ),
      )
      .orderBy(desc(providerContracts.startDate));
  }

  async get(id: string): Promise<Contract> {
    const [row] = await this.db
      .select(contractColumns(this.providers.today()))
      .from(providerContracts)
      .where(and(this.scope.where(providerContracts), eq(providerContracts.id, id)));
    if (!row) throw notFound();
    return row;
  }

  async create(providerId: string, input: CreateContract): Promise<Contract> {
    await this.providers.assertExists(providerId);
    assertDateRange(input.startDate, input.endDate ?? null);

    const [row] = await this.db
      .insert(providerContracts)
      .values(
        this.scope.forInsert({
          serviceProviderId: providerId,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          workAgreement: input.workAgreement,
          paymentFrequency: input.paymentFrequency,
          totalAmount: input.totalAmount,
        }),
      )
      .returning({ id: providerContracts.id });
    if (!row) throw new Error('Insert returned no rows');

    const contract = await this.get(row.id);
    await this.audit.log({
      action: 'contract.create',
      entityType: 'provider_contract',
      entityId: contract.id,
      changes: { after: auditable(contract) },
    });
    return contract;
  }

  async update(id: string, changes: UpdateContract): Promise<Contract> {
    const before = await this.get(id);
    assertDateRange(
      changes.startDate ?? before.startDate,
      changes.endDate !== undefined ? changes.endDate : before.endDate,
    );

    await this.db
      .update(providerContracts)
      .set(
        this.scope.forUpdate({
          ...(changes.startDate !== undefined ? { startDate: changes.startDate } : {}),
          ...(changes.endDate !== undefined ? { endDate: changes.endDate } : {}),
          ...(changes.workAgreement !== undefined ? { workAgreement: changes.workAgreement } : {}),
          ...(changes.paymentFrequency !== undefined
            ? { paymentFrequency: changes.paymentFrequency }
            : {}),
          ...(changes.totalAmount !== undefined ? { totalAmount: changes.totalAmount } : {}),
        }),
      )
      .where(and(this.scope.where(providerContracts), eq(providerContracts.id, id)));

    const after = await this.get(id);
    await this.audit.log({
      action: 'contract.update',
      entityType: 'provider_contract',
      entityId: id,
      changes: { before: auditable(before), after: auditable(after) },
    });
    return after;
  }

  async remove(id: string): Promise<void> {
    const before = await this.get(id);
    await this.db
      .update(providerContracts)
      .set(this.scope.forSoftDelete())
      .where(and(this.scope.where(providerContracts), eq(providerContracts.id, id)));
    await this.audit.log({
      action: 'contract.delete',
      entityType: 'provider_contract',
      entityId: id,
      changes: { before: auditable(before) },
    });
  }
}

/** La fecha de fin no puede ser anterior al inicio (CA-6). La base de datos también lo exige. */
function assertDateRange(startDate: string, endDate: string | null): void {
  if (endDate !== null && endDate < startDate) {
    throw new DomainError(ErrorCode.INVALID_DATE_RANGE, 422);
  }
}
