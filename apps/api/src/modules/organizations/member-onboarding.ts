import { ErrorCode } from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { ENV, type Env } from '../../config/env';
import type { DbExecutor } from '../../db/database.module';
import { organizationMembers, users } from '../../db/schema';
import { DomainError } from '../../shared/errors/domain-error';
import { CLOCK, type Clock, OPAQUE_TOKENS, type OpaqueTokens } from '../auth/application/ports';
import { createInvitationToken, INVITE_TTL_HOURS } from '../auth/infrastructure/invitations';
import { MAILER, type Mailer } from '../mail/mailer';
import { addedToOrganizationEmail, invitationEmail } from '../mail/templates';

export interface NewMember {
  organizationId: string;
  organizationName: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Quien hace el alta (null si la hace el sistema). */
  actorId: string | null;
}

export interface OnboardedMember {
  userId: string;
  /** `true` si se envió una invitación para definir contraseña. */
  invited: boolean;
}

/**
 * Agrega una persona a una organización (F02 CA-1 y CA-11). Reutiliza el usuario si el email
 * ya existe. Si no tiene contraseña, le envía una invitación; si ya la tiene, solo un aviso.
 * Corre dentro de la transacción de quien llama: si el correo falla, no queda nada a medias.
 */
@Injectable()
export class MemberOnboarding {
  constructor(
    @Inject(OPAQUE_TOKENS) private readonly tokens: OpaqueTokens,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async addMember(tx: DbExecutor, member: NewMember): Promise<OnboardedMember> {
    const [existing] = await tx
      .select({ id: users.id, passwordHash: users.passwordHash, firstName: users.firstName })
      .from(users)
      .where(and(eq(users.email, member.email), isNull(users.deletedAt)));

    if (existing) {
      const [membership] = await tx
        .select({ userId: organizationMembers.userId })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, existing.id),
            eq(organizationMembers.organizationId, member.organizationId),
          ),
        );
      if (membership) throw new DomainError(ErrorCode.ALREADY_MEMBER, 409);
    }

    const [user] = existing
      ? [existing]
      : await tx
          .insert(users)
          .values({
            email: member.email,
            firstName: member.firstName,
            lastName: member.lastName,
            createdBy: member.actorId,
            updatedBy: member.actorId,
          })
          .returning({
            id: users.id,
            passwordHash: users.passwordHash,
            firstName: users.firstName,
          });
    if (!user) throw new Error('Insert returned no rows');

    await tx.insert(organizationMembers).values({
      userId: user.id,
      organizationId: member.organizationId,
      role: 'admin',
      createdBy: member.actorId,
      updatedBy: member.actorId,
    });

    const invited = user.passwordHash === null;
    if (invited) {
      await this.sendInvitation(tx, {
        userId: user.id,
        email: member.email,
        firstName: user.firstName,
        organizationName: member.organizationName,
      });
    } else {
      await this.mailer.send(
        addedToOrganizationEmail({
          to: member.email,
          firstName: user.firstName,
          organizationName: member.organizationName,
          loginUrl: new URL('/login', this.env.WEB_URL).toString(),
        }),
      );
    }
    return { userId: user.id, invited };
  }

  /** Crea un token nuevo (invalida los anteriores) y envía el correo de invitación. */
  async sendInvitation(
    tx: DbExecutor,
    input: { userId: string; email: string; firstName: string; organizationName: string },
  ): Promise<void> {
    const token = await createInvitationToken(tx, this.tokens, input.userId, this.clock.now());
    const link = new URL('/activar', this.env.WEB_URL);
    link.searchParams.set('token', token);
    await this.mailer.send(
      invitationEmail({
        to: input.email,
        firstName: input.firstName,
        organizationName: input.organizationName,
        link: link.toString(),
        expiresInHours: INVITE_TTL_HOURS,
      }),
    );
  }
}
