import {
  type CreateOrganization,
  ErrorCode,
  type Organization,
  type UpdateOrganization,
} from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { DB, type Database } from '../../db/database.module';
import { expenseCategories, organizationMembers, organizations, users } from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit.service';
import {
  CLOCK,
  type Clock,
  SESSION_REPOSITORY,
  type SessionRepository,
} from '../auth/application/ports';
import { DEFAULT_EXPENSE_CATEGORIES } from '../catalogs/default-categories';
import { MemberOnboarding } from './member-onboarding';

const activeMemberCount = sql<number>`(
  select count(*)::int from ${organizationMembers}
  where ${organizationMembers.organizationId} = ${organizations.id}
    and ${organizationMembers.isActive} and ${organizationMembers.deletedAt} is null
)`;

const columns = {
  id: organizations.id,
  name: organizations.name,
  taxId: organizations.taxId,
  status: organizations.status,
  memberCount: activeMemberCount,
  createdAt: organizations.createdAt,
};

type OrganizationRow = Omit<Organization, 'createdAt'> & { createdAt: Date };
const toDto = (row: OrganizationRow): Organization => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});

/** Gestión de organizaciones de la plataforma (F02 CA-1 a CA-3). Solo el super admin. */
@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly scope: OrgScope,
    private readonly onboarding: MemberOnboarding,
  ) {}

  async list(): Promise<Organization[]> {
    const rows = await this.db
      .select(columns)
      .from(organizations)
      .where(isNull(organizations.deletedAt))
      .orderBy(asc(organizations.name));
    return rows.map(toDto);
  }

  async get(id: string): Promise<Organization> {
    const [row] = await this.db
      .select(columns)
      .from(organizations)
      .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)));
    if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    return toDto(row);
  }

  /**
   * Crea la organización, sus categorías iniciales y su primer admin, y envía la invitación.
   * Todo en una transacción: si algo falla (incluido el correo), no queda nada creado.
   */
  async create(input: CreateOrganization): Promise<Organization> {
    const actorId = this.scope.userId;
    const organizationId = await this.db.transaction(async (tx) => {
      const [organization] = await tx
        .insert(organizations)
        .values({ name: input.name, taxId: input.taxId, createdBy: actorId, updatedBy: actorId })
        .returning({ id: organizations.id });
      if (!organization) throw new Error('Insert returned no rows');

      await tx.insert(expenseCategories).values(
        DEFAULT_EXPENSE_CATEGORIES.map((category) => ({
          ...category,
          organizationId: organization.id,
          createdBy: actorId,
          updatedBy: actorId,
        })),
      );

      await this.onboarding.addMember(tx, {
        organizationId: organization.id,
        organizationName: input.name,
        ...input.admin,
        actorId,
      });
      return organization.id;
    });

    await this.audit.log({
      action: 'organization.create',
      entityType: 'organization',
      entityId: organizationId,
      changes: { after: { name: input.name, taxId: input.taxId, admin: input.admin.email } },
    });
    return this.get(organizationId);
  }

  /** Suspender revoca las sesiones de sus miembros que no son super admin (F02 CA-2). */
  async update(id: string, changes: UpdateOrganization): Promise<Organization> {
    const before = await this.get(id);
    await this.db
      .update(organizations)
      .set({ ...changes, updatedAt: new Date(), updatedBy: this.scope.userId })
      .where(eq(organizations.id, id));

    if (changes.status === 'suspended' && before.status !== 'suspended') {
      const members = await this.db
        .select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .innerJoin(users, eq(users.id, organizationMembers.userId))
        .where(and(eq(organizationMembers.organizationId, id), eq(users.isSuperAdmin, false)));
      const now = this.clock.now();
      for (const member of members) await this.sessions.revokeAllForUser(member.userId, now);
    }

    const after = await this.get(id);
    await this.audit.log({
      action: 'organization.update',
      entityType: 'organization',
      entityId: id,
      changes: {
        before: { name: before.name, status: before.status },
        after: { name: after.name, status: after.status },
      },
    });
    return after;
  }
}
