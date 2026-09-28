import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  inet,
  jsonb,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { auditColumns, citext, id } from '../columns';
import { anderp, memberRole, organizationStatus, userStatus } from './enums';

const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' });

/** design.md §5.3 */
export const organizations = anderp.table(
  'organizations',
  {
    id: id(),
    name: varchar({ length: 100 }).notNull(),
    taxId: varchar({ length: 20 }).notNull(),
    status: organizationStatus().notNull().default('active'),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex('organizations_tax_id_uq')
      .on(t.taxId)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/**
 * Personas que inician sesión en AndERP. Es global: un usuario puede pertenecer a varias
 * organizaciones. `password_hash` es NULL mientras una invitación no se ha aceptado (F02).
 */
export const users = anderp.table(
  'users',
  {
    id: id(),
    email: citext().notNull(),
    passwordHash: text(),
    firstName: varchar({ length: 30 }).notNull(),
    lastName: varchar({ length: 30 }).notNull(),
    isSuperAdmin: boolean().notNull().default(false),
    status: userStatus().notNull().default('active'),
    failedLoginAttempts: smallint().notNull().default(0),
    lockedUntil: timestamptz(),
    lastLoginAt: timestamptz(),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex('users_email_uq')
      .on(t.email)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const organizationMembers = anderp.table(
  'organization_members',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    role: memberRole().notNull(),
    ...auditColumns,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.organizationId] }),
    index('organization_members_organization_idx').on(t.organizationId),
  ],
);

/** Refresh tokens con rotación. `family_id` agrupa los tokens de un mismo inicio de sesión. */
export const sessions = anderp.table(
  'sessions',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    familyId: uuid().notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamptz().notNull(),
    revokedAt: timestamptz(),
    ip: inet(),
    userAgent: text(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_uq').on(t.tokenHash),
    index('sessions_family_idx').on(t.familyId),
    index('sessions_user_idx').on(t.userId),
  ],
);

export const passwordResets = anderp.table(
  'password_resets',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    purpose: varchar({ length: 10 }).notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamptz().notNull(),
    usedAt: timestamptz(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('password_resets_token_hash_uq').on(t.tokenHash),
    index('password_resets_user_idx').on(t.userId),
    check('password_resets_purpose_ck', sql`${t.purpose} in ('reset', 'invite')`),
  ],
);

/** Solo inserción: `app_runtime` no tiene UPDATE, DELETE ni TRUNCATE (design.md §5.9). */
export const auditLogs = anderp.table(
  'audit_logs',
  {
    id: id(),
    organizationId: uuid().references(() => organizations.id),
    userId: uuid().references(() => users.id),
    action: varchar({ length: 50 }).notNull(),
    entityType: varchar({ length: 50 }),
    entityId: uuid(),
    changes: jsonb(),
    ip: inet(),
    userAgent: text(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_organization_created_idx').on(t.organizationId, t.createdAt),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
  ],
);
