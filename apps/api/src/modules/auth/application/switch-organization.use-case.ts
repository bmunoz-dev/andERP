import { ErrorCode, type SwitchOrganization } from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../shared/context/request-context';
import { DomainError } from '../../../shared/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../../audit/audit.service';
import { requireAccess } from './access';
import {
  CLOCK,
  type Clock,
  SESSION_REPOSITORY,
  type SessionRepository,
  USER_REPOSITORY,
  type UserRepository,
} from './ports';

/** Cambia la organización activa de la sesión (F20 CA-8 y CA-9). */
@Injectable()
export class SwitchOrganizationUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
  ) {}

  async execute(actor: Actor, { organizationId }: SwitchOrganization): Promise<void> {
    const user = await this.users.findById(actor.userId);
    const memberships = user ? await this.users.findMemberships(user.id) : [];
    const { organizations } = requireAccess(user, memberships, actor.organizationId, 401);
    if (!organizations.some((o) => o.organizationId === organizationId)) {
      throw new DomainError(ErrorCode.NOT_FOUND, 404);
    }
    if (organizationId === actor.organizationId) return;

    await this.sessions.switchOrganization(
      actor.sessionFamilyId,
      actor.userId,
      organizationId,
      this.clock.now(),
    );
    // Fuera de la transacción, como los demás eventos de auth (F12 CA-3).
    await this.audit.log({
      action: 'auth.organization_switch',
      organizationId,
      changes: { from: actor.organizationId, to: organizationId },
    });
  }
}
