import {
  type DismissNotification,
  ErrorCode,
  type NotificationItem,
  type Notifications,
} from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DB, type Database } from '../../db/database.module';
import { notificationStates as n } from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { ObligationsService } from '../obligations/obligations.service';

type Active = Omit<NotificationItem, 'seen'>;

/**
 * F14: las notificaciones se calculan de la Agenda (vencimientos Próximos y Vencidos, con su
 * orden); solo se guarda lo que cada usuario vio y descartó. Ver y descartar no se auditan (CA-6).
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly scope: OrgScope,
    private readonly obligations: ObligationsService,
  ) {}

  private async active(): Promise<Active[]> {
    return (await this.obligations.list()).flatMap((o) =>
      o.pending && o.daysLeft !== null && (o.status === 'overdue' || o.status === 'upcoming')
        ? [
            {
              dueDateId: o.pending.id,
              kind: `obligation_${o.status}` as const,
              obligationId: o.id,
              entityName: o.entityName,
              concept: o.concept,
              dueDate: o.pending.dueDate,
              daysLeft: o.daysLeft,
            },
          ]
        : [],
    );
  }

  /** Filas del usuario en su organización (la tabla no tiene borrado lógico: no usa `scope.where`). */
  private mine() {
    return and(eq(n.organizationId, this.scope.organizationId), eq(n.userId, this.scope.userId));
  }

  async list(): Promise<Notifications> {
    const active = await this.active();
    if (active.length === 0) return { unseen: false, items: [] };
    const states = await this.db
      .select()
      .from(n)
      .where(
        and(
          this.mine(),
          inArray(
            n.dueDateId,
            active.map((a) => a.dueDateId),
          ),
        ),
      );
    const state = (a: Active) =>
      states.find((s) => s.dueDateId === a.dueDateId && s.kind === a.kind);
    const items = active
      .filter((a) => !state(a)?.dismissedAt)
      .map((a) => ({ ...a, seen: !!state(a)?.seenAt }));
    return { unseen: items.some((i) => !i.seen), items };
  }

  /** Marca como vistas las notificaciones activas en este momento (CA-8). */
  async markSeen(): Promise<void> {
    await this.upsert(await this.active(), 'seenAt');
  }

  /** Descarta una notificación activa de la organización (CA-9). */
  async dismiss({ dueDateId, kind }: DismissNotification): Promise<void> {
    const target = (await this.active()).filter(
      (a) => a.dueDateId === dueDateId && a.kind === kind,
    );
    if (target.length === 0) throw new DomainError(ErrorCode.NOTIFICATION_NOT_FOUND, 404);
    await this.upsert(target, 'dismissedAt');
  }

  /** Inserta o actualiza el estado sin pisar una fecha que ya exista (idempotente). */
  private async upsert(items: Active[], column: 'seenAt' | 'dismissedAt'): Promise<void> {
    if (items.length === 0) return;
    const now = new Date();
    // Calificada: en `ON CONFLICT DO UPDATE` una columna sin tabla es ambigua con `excluded`.
    const name = sql.identifier(column === 'seenAt' ? 'seen_at' : 'dismissed_at');
    await this.db
      .insert(n)
      .values(
        items.map((i) => ({
          organizationId: this.scope.organizationId,
          userId: this.scope.userId,
          dueDateId: i.dueDateId,
          kind: i.kind,
          [column]: now,
        })),
      )
      .onConflictDoUpdate({
        target: [n.userId, n.dueDateId, n.kind],
        set: {
          [column]: sql`coalesce(notification_states.${name}, excluded.${name})`,
          updatedAt: now,
        },
      });
  }
}
