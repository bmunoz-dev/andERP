import { sql } from 'drizzle-orm';
import {
  char,
  check,
  foreignKey,
  integer,
  text,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns, id, organizationId } from '../columns';
import { organizations } from './core';
import { anderp } from './enums';
import { providerContracts } from './service-providers';

/**
 * F17: archivo del contrato en Supabase Storage. El vigente es el no borrado; reemplazar o
 * eliminar solo marca la fila y el objeto se queda en el bucket (design.md §5.13).
 */
export const contractDocuments = anderp.table(
  'contract_documents',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    contractId: uuid().notNull(),
    storageKey: text().notNull(),
    fileName: varchar({ length: 255 }).notNull(),
    contentType: varchar({ length: 100 }).notNull(),
    sizeBytes: integer().notNull(),
    sha256: char({ length: 64 }).notNull(),
    ...auditColumns,
  },
  (t) => [
    unique('contract_documents_org_id_uq').on(t.organizationId, t.id),
    unique('contract_documents_storage_key_uq').on(t.storageKey),
    foreignKey({
      name: 'contract_documents_contract_fk',
      columns: [t.organizationId, t.contractId],
      foreignColumns: [providerContracts.organizationId, providerContracts.id],
    }),
    uniqueIndex('contract_documents_active_uq')
      .on(t.contractId)
      .where(sql`${t.deletedAt} is null`),
    check(
      'contract_documents_type_ck',
      sql`${t.contentType} in ('application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')`,
    ),
    check('contract_documents_size_ck', sql`${t.sizeBytes} between 1 and 10485760`),
    check('contract_documents_sha256_ck', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);
