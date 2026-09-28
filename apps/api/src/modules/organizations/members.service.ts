import { ErrorCode, type InviteMember, type Member } from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, isNull, ne } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import { DB, type Database } from '../../db/database.module';
import { organizationMembers, organizations, users } from '../../db/schema';
import type { RequestContext } from '../../shared/context/request-context';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit.service';
import {
  CLOCK,
  type Clock,
  SESSION_REPOSITORY,
  type SessionRepository,
} from '../auth/application/ports';
import { requireActor } from '../auth/http/guards';
import { MemberOnboarding } from './member-onboarding';

const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);

/** Usuarios de la organización del actor (F02 CA-11 a CA-15). */
@Injectable()
export class MembersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly scope: OrgScope,
    private readonly cls: ClsService<RequestContext>,
    private readonly onboarding: MemberOnboarding,
  ) {}

  async list(): Promise<Member[]> {
    const rows = await this.db
      .select({
        userId: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: organizationMembers.role,
        isActive: organizationMembers.isActive,
        isSuperAdmin: users.isSuperAdmin,
        passwordHash: users.passwordHash,
        lastLoginAt: users.lastLoginAt,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(this.scope.where(organizationMembers))
      .orderBy(asc(users.firstName), asc(users.lastName));

    return rows.map(({ passwordHash, lastLoginAt, ...member }) => ({
      ...member,
      invitationPending: passwordHash === null,
      lastLoginAt: lastLoginAt?.toISOString() ?? null,
    }));
  }

  async invite(input: InviteMember): Promise<Member> {
    const organizationId = this.scope.organizationId;
    const { userId } = await this.db.transaction(async (tx) =>
      this.onboarding.addMember(tx, {
        organizationId,
        organizationName: await this.organizationName(),
        ...input,
        actorId: this.scope.userId,
      }),
    );
    await this.audit.log({
      action: 'member.invite',
      entityType: 'user',
      entityId: userId,
      changes: { after: { email: input.email } },
    });
    return this.get(userId);
  }

  /** Invalida las invitaciones anteriores y envía una nueva (F02 CA-13). */
  async resendInvite(userId: string): Promise<void> {
    const member = await this.get(userId);
    if (!member.invitationPending) throw new DomainError(ErrorCode.INVITE_NOT_PENDING, 422);
    const organizationName = await this.organizationName();
    await this.db.transaction((tx) =>
      this.onboarding.sendInvitation(tx, {
        userId,
        email: member.email,
        firstName: member.firstName,
        organizationName,
      }),
    );
    await this.audit.log({ action: 'member.invite_resent', entityType: 'user', entityId: userId });
  }

  /**
   * Activa o desactiva la membresía (F02 CA-14). Nadie se desactiva a sí mismo, la organización
   * no puede quedar sin admins activos y solo un super admin puede tocar a otro super admin.
   */
  async setActive(userId: string, isActive: boolean): Promise<Member> {
    const actor = requireActor(this.cls);
    const member = await this.get(userId);
    if (member.isActive === isActive) return member;

    if (!isActive) {
      if (userId === actor.userId) throw new DomainError(ErrorCode.CANNOT_DEACTIVATE_SELF, 422);
      const [others] = await this.db
        .select({ total: count() })
        .from(organizationMembers)
        .where(
          and(
            this.scope.where(organizationMembers),
            eq(organizationMembers.isActive, true),
            ne(organizationMembers.userId, userId),
          ),
        );
      if (!others || others.total === 0) throw new DomainError(ErrorCode.LAST_ADMIN, 422);
    }
    if (member.isSuperAdmin && !actor.isSuperAdmin) throw new DomainError(ErrorCode.FORBIDDEN, 403);

    await this.db
      .update(organizationMembers)
      .set(this.scope.forUpdate({ isActive }))
      .where(and(this.scope.where(organizationMembers), eq(organizationMembers.userId, userId)));
    if (!isActive) await this.sessions.revokeAllForUser(userId, this.clock.now());

    await this.audit.log({
      action: isActive ? 'member.activate' : 'member.deactivate',
      entityType: 'user',
      entityId: userId,
    });
    return this.get(userId);
  }

  private async get(userId: string): Promise<Member> {
    const member = (await this.list()).find((m) => m.userId === userId);
    if (!member) throw notFound();
    return member;
  }

  private async organizationName(): Promise<string> {
    const [row] = await this.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(and(eq(organizations.id, this.scope.organizationId), isNull(organizations.deletedAt)));
    if (!row) throw notFound();
    return row.name;
  }
}
