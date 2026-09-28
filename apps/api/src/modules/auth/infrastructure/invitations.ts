import { and, eq, isNull } from 'drizzle-orm';
import type { DbExecutor } from '../../../db/database.module';
import { passwordResets } from '../../../db/schema';
import type { OpaqueTokens } from '../application/ports';

/** Las invitaciones duran más que una recuperación: la persona puede tardar en ver el correo. */
export const INVITE_TTL_HOURS = 72;

/**
 * Crea un token de invitación (F02 CA-11 y CA-13) e invalida los anteriores del usuario.
 * Recibe el ejecutor para poder correr dentro de la transacción de quien invita: si el correo
 * falla, la transacción se revierte y no quedan invitaciones huérfanas.
 */
export async function createInvitationToken(
  db: DbExecutor,
  tokens: OpaqueTokens,
  userId: string,
  now: Date,
): Promise<string> {
  await db
    .update(passwordResets)
    .set({ usedAt: now })
    .where(
      and(
        eq(passwordResets.userId, userId),
        eq(passwordResets.purpose, 'invite'),
        isNull(passwordResets.usedAt),
      ),
    );
  const token = tokens.generate();
  await db.insert(passwordResets).values({
    userId,
    purpose: 'invite',
    tokenHash: tokens.hash(token),
    expiresAt: new Date(now.getTime() + INVITE_TTL_HOURS * 3_600_000),
  });
  return token;
}
