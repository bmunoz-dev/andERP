import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  numeric,
  text,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns, id, organizationId } from '../columns';
import { accountTypes, banks, documentTypes } from './catalogs';
import { organizations } from './core';
import { anderp, paymentFrequency } from './enums';

/** Prestadores de servicios (design.md §5.5). La cuenta bancaria va completa o no va. */
export const serviceProviders = anderp.table(
  'service_providers',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    name: varchar({ length: 100 }).notNull(),
    documentTypeId: uuid()
      .notNull()
      .references(() => documentTypes.id),
    documentNumber: varchar({ length: 20 }).notNull(),
    description: text(),
    bankId: uuid().references(() => banks.id),
    accountTypeId: uuid().references(() => accountTypes.id),
    accountNumber: varchar({ length: 30 }),
    /** F09: un prestador inactivo no recibe contratos nuevos. */
    isActive: boolean().notNull().default(true),
    ...auditColumns,
  },
  (t) => [
    unique('service_providers_org_id_uq').on(t.organizationId, t.id),
    uniqueIndex('service_providers_document_uq')
      .on(t.organizationId, t.documentTypeId, t.documentNumber)
      .where(sql`${t.deletedAt} is null`),
    check(
      'service_providers_bank_all_or_none',
      sql`(${t.bankId} is null and ${t.accountTypeId} is null and ${t.accountNumber} is null)
        or (${t.bankId} is not null and ${t.accountTypeId} is not null and ${t.accountNumber} is not null)`,
    ),
  ],
);

/**
 * Contratos de un prestador. El histórico se conserva: renovar es crear otro contrato.
 * La restricción EXCLUDE que impide fechas cruzadas va en una migración escrita a mano.
 */
export const providerContracts = anderp.table(
  'provider_contracts',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    serviceProviderId: uuid().notNull(),
    startDate: date({ mode: 'string' }).notNull(),
    endDate: date({ mode: 'string' }),
    workAgreement: text().notNull(),
    paymentFrequency: paymentFrequency().notNull(),
    totalAmount: numeric({ precision: 14, scale: 2 }).notNull(),
    ...auditColumns,
  },
  (t) => [
    unique('provider_contracts_org_id_uq').on(t.organizationId, t.id),
    // FK compuesta: un contrato no puede apuntar a un prestador de otra organización.
    foreignKey({
      name: 'provider_contracts_provider_fk',
      columns: [t.organizationId, t.serviceProviderId],
      foreignColumns: [serviceProviders.organizationId, serviceProviders.id],
    }),
    check('provider_contracts_total_amount_ck', sql`${t.totalAmount} > 0`),
    check(
      'provider_contracts_date_range_ck',
      sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`,
    ),
  ],
);
