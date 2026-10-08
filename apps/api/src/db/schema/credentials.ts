import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns, bytea, citext, id, organizationId } from '../columns';
import { organizations } from './core';
import { anderp } from './enums';

/** Personas responsables de las credenciales (design.md §5.8). */
export const responsiblePersons = anderp.table(
  'responsible_persons',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    firstName: varchar({ length: 30 }).notNull(),
    lastName: varchar({ length: 30 }).notNull(),
    email: citext(),
    phone: varchar({ length: 20 }),
    ...auditColumns,
  },
  (t) => [
    unique('responsible_persons_org_id_uq').on(t.organizationId, t.id),
    check('responsible_persons_contact_ck', sql`${t.email} is not null or ${t.phone} is not null`),
  ],
);

/** Credenciales de portales externos; la contraseña va cifrada con AES-256-GCM (§6.3). */
export const entityCredentials = anderp.table(
  'entity_credentials',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    responsiblePersonId: uuid(),
    entityName: varchar({ length: 100 }).notNull(),
    username: varchar({ length: 254 }).notNull(),
    url: text(),
    contact1: varchar('contact_1', { length: 50 }),
    contact2: varchar('contact_2', { length: 50 }),
    notes: text(),
    passwordCiphertext: bytea().notNull(),
    passwordIv: bytea().notNull(),
    passwordAuthTag: bytea().notNull(),
    keyVersion: smallint().notNull(),
    ...auditColumns,
  },
  (t) => [
    unique('entity_credentials_org_id_uq').on(t.organizationId, t.id),
    // MATCH SIMPLE: con responsible_person_id NULL la FK no se valida.
    foreignKey({
      name: 'entity_credentials_responsible_fk',
      columns: [t.organizationId, t.responsiblePersonId],
      foreignColumns: [responsiblePersons.organizationId, responsiblePersons.id],
    }),
    uniqueIndex('entity_credentials_uq')
      .on(t.organizationId, t.entityName, t.username)
      .where(sql`${t.deletedAt} is null`),
    check('entity_credentials_url_length_ck', sql`char_length(${t.url}) <= 2048`),
  ],
);
