import {
  BUSINESS_TIME_ZONE,
  type CatalogKind,
  type CreateServiceProvider,
  ErrorCode,
  type ServiceProvider,
  todayIn,
  type UpdateServiceProvider,
} from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, exists, ilike, inArray, not, or, type SQL } from 'drizzle-orm';
import { DB, type Database } from '../../db/database.module';
import {
  accountTypes,
  banks,
  contractMonthTotals,
  documentTypes,
  providerContracts,
  serviceProviders,
} from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { CLOCK, type Clock } from '../auth/application/ports';
import { GlobalCatalogsService } from '../catalogs/global-catalogs.service';
import { activeOn, contractColumns, monthTotalsJoin } from './contract-queries';

const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);

/** Escapa los comodines de LIKE para buscar el texto tal cual lo escribió el usuario. */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export interface ProviderFilters {
  search?: string;
  hasActiveContract?: boolean;
}

interface BankAccount {
  bankId: string | null;
  accountTypeId: string | null;
  accountNumber: string | null;
}

/** Campos de cuenta tal como llegan en una petición (ausentes = sin cambio). */
interface BankAccountChanges {
  bankId?: string | null | undefined;
  accountTypeId?: string | null | undefined;
  accountNumber?: string | null | undefined;
}

/** Prestadores de servicios de la organización del actor (F03 CA-1 a CA-5). */
@Injectable()
export class ServiceProvidersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly scope: OrgScope,
    private readonly catalogs: GlobalCatalogsService,
  ) {}

  today(): string {
    return todayIn(BUSINESS_TIME_ZONE, this.clock.now());
  }

  async list(filters: ProviderFilters = {}): Promise<ServiceProvider[]> {
    const today = this.today();
    const conditions: (SQL | undefined)[] = [this.scope.where(serviceProviders)];

    const search = filters.search?.trim();
    if (search) {
      conditions.push(
        or(
          ilike(serviceProviders.name, likePattern(search)),
          ilike(serviceProviders.documentNumber, likePattern(search)),
        ),
      );
    }
    if (filters.hasActiveContract !== undefined) {
      const hasActive = exists(
        this.db
          .select({ id: providerContracts.id })
          .from(providerContracts)
          .where(
            and(
              eq(providerContracts.organizationId, serviceProviders.organizationId),
              eq(providerContracts.serviceProviderId, serviceProviders.id),
              activeOn(today),
            ),
          ),
      );
      conditions.push(filters.hasActiveContract ? hasActive : not(hasActive));
    }

    const rows = await this.db
      .select({
        id: serviceProviders.id,
        name: serviceProviders.name,
        documentTypeId: documentTypes.id,
        documentTypeCode: documentTypes.code,
        documentNumber: serviceProviders.documentNumber,
        description: serviceProviders.description,
        bankId: banks.id,
        bankName: banks.name,
        accountTypeId: accountTypes.id,
        accountTypeName: accountTypes.name,
        accountNumber: serviceProviders.accountNumber,
        isActive: serviceProviders.isActive,
      })
      .from(serviceProviders)
      .innerJoin(documentTypes, eq(documentTypes.id, serviceProviders.documentTypeId))
      .leftJoin(banks, eq(banks.id, serviceProviders.bankId))
      .leftJoin(accountTypes, eq(accountTypes.id, serviceProviders.accountTypeId))
      .where(and(...conditions))
      .orderBy(asc(serviceProviders.name));

    // El contrato vigente de cada prestador, en una sola consulta (sin N+1).
    const ids = rows.map((r) => r.id);
    const active =
      ids.length === 0
        ? []
        : await this.db
            .select(contractColumns(today))
            .from(providerContracts)
            .leftJoin(contractMonthTotals, monthTotalsJoin(today))
            .where(
              and(
                this.scope.where(providerContracts),
                inArray(providerContracts.serviceProviderId, ids),
                activeOn(today),
              ),
            );
    const activeByProvider = new Map(active.map((c) => [c.serviceProviderId, c]));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      documentType: { id: r.documentTypeId, code: r.documentTypeCode },
      documentNumber: r.documentNumber,
      description: r.description,
      bank: r.bankId && r.bankName ? { id: r.bankId, name: r.bankName } : null,
      accountType:
        r.accountTypeId && r.accountTypeName
          ? { id: r.accountTypeId, name: r.accountTypeName }
          : null,
      accountNumber: r.accountNumber,
      isActive: r.isActive,
      activeContract: activeByProvider.get(r.id) ?? null,
    }));
  }

  async get(id: string): Promise<ServiceProvider> {
    const [provider] = (await this.list()).filter((p) => p.id === id);
    if (!provider) throw notFound();
    return provider;
  }

  /** Lanza 404 si el prestador no existe en la organización del actor. */
  async assertExists(id: string): Promise<void> {
    const [row] = await this.db
      .select({ id: serviceProviders.id })
      .from(serviceProviders)
      .where(and(this.scope.where(serviceProviders), eq(serviceProviders.id, id)));
    if (!row) throw notFound();
  }

  async create(input: CreateServiceProvider): Promise<ServiceProvider> {
    const bankAccount = this.bankAccount({}, input);
    await this.assertCatalogsActive({ documentTypeId: input.documentTypeId, ...bankAccount });

    const [row] = await this.db
      .insert(serviceProviders)
      .values(
        this.scope.forInsert({
          name: input.name,
          documentTypeId: input.documentTypeId,
          documentNumber: input.documentNumber,
          description: input.description ?? null,
          ...bankAccount,
        }),
      )
      .returning({ id: serviceProviders.id });
    if (!row) throw new Error('Insert returned no rows');
    return this.get(row.id);
  }

  async update(id: string, changes: UpdateServiceProvider): Promise<ServiceProvider> {
    const [current] = await this.db
      .select({
        documentTypeId: serviceProviders.documentTypeId,
        bankId: serviceProviders.bankId,
        accountTypeId: serviceProviders.accountTypeId,
        accountNumber: serviceProviders.accountNumber,
      })
      .from(serviceProviders)
      .where(and(this.scope.where(serviceProviders), eq(serviceProviders.id, id)));
    if (!current) throw notFound();

    const bankAccount = this.bankAccount(current, changes);
    // Solo se exige que esté activo un valor que cambia: los antiguos se conservan (CA-3).
    await this.assertCatalogsActive({
      documentTypeId:
        changes.documentTypeId !== undefined && changes.documentTypeId !== current.documentTypeId
          ? changes.documentTypeId
          : null,
      bankId: bankAccount.bankId !== current.bankId ? bankAccount.bankId : null,
      accountTypeId:
        bankAccount.accountTypeId !== current.accountTypeId ? bankAccount.accountTypeId : null,
    });

    await this.db
      .update(serviceProviders)
      .set(
        this.scope.forUpdate({
          ...(changes.name !== undefined ? { name: changes.name } : {}),
          ...(changes.documentTypeId !== undefined
            ? { documentTypeId: changes.documentTypeId }
            : {}),
          ...(changes.documentNumber !== undefined
            ? { documentNumber: changes.documentNumber }
            : {}),
          ...(changes.description !== undefined ? { description: changes.description } : {}),
          // F09: las reglas de desactivación las aplica el trigger `service_providers_guard_deactivation`.
          ...(changes.isActive !== undefined ? { isActive: changes.isActive } : {}),
          ...bankAccount,
        }),
      )
      .where(and(this.scope.where(serviceProviders), eq(serviceProviders.id, id)));
    return this.get(id);
  }

  /** No se borra un prestador con contratos: primero se borran sus contratos (CA-5). */
  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    const [contract] = await this.db
      .select({ id: providerContracts.id })
      .from(providerContracts)
      .where(and(this.scope.where(providerContracts), eq(providerContracts.serviceProviderId, id)))
      .limit(1);
    if (contract) throw new DomainError(ErrorCode.PROVIDER_HAS_CONTRACTS, 422);

    await this.db
      .update(serviceProviders)
      .set(this.scope.forSoftDelete())
      .where(and(this.scope.where(serviceProviders), eq(serviceProviders.id, id)));
  }

  /** Combina la cuenta actual con los cambios y exige que quede completa o vacía (CA-1). */
  private bankAccount(current: BankAccountChanges, changes: BankAccountChanges): BankAccount {
    const merged: BankAccount = {
      bankId: changes.bankId !== undefined ? changes.bankId : (current.bankId ?? null),
      accountTypeId:
        changes.accountTypeId !== undefined
          ? changes.accountTypeId
          : (current.accountTypeId ?? null),
      accountNumber:
        changes.accountNumber !== undefined
          ? changes.accountNumber
          : (current.accountNumber ?? null),
    };
    const filled = [merged.bankId, merged.accountTypeId, merged.accountNumber].filter(
      (v) => v !== null && v !== '',
    ).length;
    if (filled !== 0 && filled !== 3) throw new DomainError(ErrorCode.INCOMPLETE_BANK_ACCOUNT, 422);
    return filled === 0 ? { bankId: null, accountTypeId: null, accountNumber: null } : merged;
  }

  private async assertCatalogsActive(values: {
    documentTypeId: string | null;
    bankId: string | null;
    accountTypeId: string | null;
  }): Promise<void> {
    const checks: [CatalogKind, string | null][] = [
      ['document-types', values.documentTypeId],
      ['banks', values.bankId],
      ['account-types', values.accountTypeId],
    ];
    for (const [kind, id] of checks) {
      if (id && !(await this.catalogs.isActive(kind, id))) {
        throw new DomainError(ErrorCode.INACTIVE_CATALOG_VALUE, 422, kind);
      }
    }
  }
}
