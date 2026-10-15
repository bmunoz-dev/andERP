import {
  type CompleteDueDate,
  type CreateObligation,
  ErrorCode,
  type Obligation,
  type ObligationDetail,
  type ObligationStatus,
  type PendingDueDate,
  todayIn,
  type UpdateObligation,
} from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { DB, type Database, type DbExecutor } from '../../db/database.module';
import { obligationDueDates as d, paymentObligations as o, users } from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit.service';

const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);

/** Lo que se audita de una obligación: la regla, sin el estado calculado. */
const auditable = (x: Obligation) => ({
  entityName: x.entityName,
  concept: x.concept,
  frequency: x.frequency,
  noticeDays: x.noticeDays,
  notes: x.notes,
});

/**
 * Agenda de pagos (F13). El estado se calcula con la fecha de Bogotá y no se guarda (CA-10);
 * "un solo pendiente" y el historial fijo los garantiza la base de datos.
 */
@Injectable()
export class ObligationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly scope: OrgScope,
  ) {}

  /** Una fila por obligación con su pendiente (si hay), estado y días restantes (CA-11). */
  private async agenda(
    db: DbExecutor,
    filter: { id?: string; status?: ObligationStatus } = {},
  ): Promise<Obligation[]> {
    const today = sql`${todayIn()}::date`;
    const status = sql<ObligationStatus>`(case
      when ${d.id} is null then 'none'
      when ${d.dueDate} < ${today} then 'overdue'
      when ${d.dueDate} <= ${today} + ${o.noticeDays} then 'upcoming'
      else 'scheduled' end)`;
    const rows = await db
      .select({
        id: o.id,
        entityName: o.entityName,
        concept: o.concept,
        frequency: o.frequency,
        noticeDays: o.noticeDays,
        notes: o.notes,
        pendingId: d.id,
        dueDate: d.dueDate,
        status,
        daysLeft: sql<number | null>`(${d.dueDate} - ${today})`,
      })
      .from(o)
      .leftJoin(d, and(eq(d.obligationId, o.id), isNull(d.completedAt), isNull(d.deletedAt)))
      .where(
        and(
          this.scope.where(o),
          filter.id ? eq(o.id, filter.id) : undefined,
          filter.status ? sql`${status} = ${filter.status}` : undefined,
        ),
      )
      .orderBy(
        sql`case ${status} when 'overdue' then 0 when 'upcoming' then 1 when 'scheduled' then 2 else 3 end`,
        asc(d.dueDate),
        asc(o.entityName),
      );
    return rows.map(({ pendingId, dueDate, ...r }) => ({
      ...r,
      pending: pendingId && dueDate ? { id: pendingId, dueDate } : null,
    }));
  }

  list(status?: ObligationStatus): Promise<Obligation[]> {
    return this.agenda(this.db, status ? { status } : {});
  }

  /** Detalle con el historial del más reciente al más antiguo (CA-12). */
  async get(id: string, db: DbExecutor = this.db): Promise<ObligationDetail> {
    const [row] = await this.agenda(db, { id });
    if (!row) throw notFound();
    const history = await db
      .select({
        id: d.id,
        dueDate: d.dueDate,
        completedAt: d.completedAt,
        userId: users.id,
        userName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
      })
      .from(d)
      .leftJoin(users, eq(users.id, d.completedBy))
      .where(and(this.scope.where(d), eq(d.obligationId, id)))
      .orderBy(desc(d.dueDate));
    return {
      ...row,
      history: history.map((h) => ({
        id: h.id,
        dueDate: h.dueDate,
        completedAt: h.completedAt?.toISOString() ?? null,
        completedBy: h.userId ? { id: h.userId, name: h.userName } : null,
      })),
    };
  }

  /** CA-3: la obligación y su primer vencimiento se crean juntos. */
  async create(input: CreateObligation): Promise<ObligationDetail> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(o)
        .values(
          this.scope.forInsert({
            entityName: input.entityName,
            concept: input.concept,
            frequency: input.frequency,
            noticeDays: input.noticeDays ?? 15,
            notes: input.notes ?? null,
          }),
        )
        .returning({ id: o.id });
      if (!row) throw new Error('Insert returned no rows');
      await tx
        .insert(d)
        .values(this.scope.forInsert({ obligationId: row.id, dueDate: input.firstDueDate }));
      const created = await this.get(row.id, tx);
      await this.audit.log(
        {
          action: 'obligation.create',
          entityType: 'obligation',
          entityId: row.id,
          changes: { after: { ...auditable(created), firstDueDate: input.firstDueDate } },
        },
        tx,
      );
      return created;
    });
  }

  async update(id: string, changes: UpdateObligation): Promise<ObligationDetail> {
    return this.db.transaction(async (tx) => {
      const before = await this.get(id, tx);
      const [row] = await tx
        .update(o)
        .set(
          this.scope.forUpdate({
            ...(changes.entityName !== undefined ? { entityName: changes.entityName } : {}),
            ...(changes.concept !== undefined ? { concept: changes.concept } : {}),
            ...(changes.frequency !== undefined ? { frequency: changes.frequency } : {}),
            ...(changes.noticeDays !== undefined ? { noticeDays: changes.noticeDays } : {}),
            ...(changes.notes !== undefined ? { notes: changes.notes } : {}),
          }),
        )
        .where(and(this.scope.where(o), eq(o.id, id)))
        .returning({ id: o.id });
      if (!row) throw notFound();
      const after = await this.get(id, tx);
      await this.audit.log(
        {
          action: 'obligation.update',
          entityType: 'obligation',
          entityId: id,
          changes: { before: auditable(before), after: auditable(after) },
        },
        tx,
      );
      return after;
    });
  }

  /**
   * CA-6 y CA-7: completa el vencimiento que el usuario está viendo. Si otro lo completó primero,
   * el UPDATE ya no cumple el WHERE (espera su bloqueo y lo reevalúa): 409, sin siguiente ni auditoría.
   */
  async complete(id: string, input: CompleteDueDate): Promise<ObligationDetail> {
    return this.db.transaction(async (tx) => {
      await this.get(id, tx);
      const [done] = await tx
        .update(d)
        .set(this.scope.forUpdate({ completedAt: new Date(), completedBy: this.scope.userId }))
        .where(
          and(
            this.scope.where(d),
            eq(d.id, input.dueDateId),
            eq(d.obligationId, id),
            isNull(d.completedAt),
          ),
        )
        .returning({ dueDate: d.dueDate });
      if (!done) {
        const [existing] = await tx
          .select({ id: d.id })
          .from(d)
          .where(and(this.scope.where(d), eq(d.id, input.dueDateId), eq(d.obligationId, id)));
        throw existing ? new DomainError(ErrorCode.DUE_DATE_ALREADY_COMPLETED, 409) : notFound();
      }
      if (input.nextDueDate !== undefined) {
        if (input.nextDueDate <= done.dueDate) {
          throw new DomainError(ErrorCode.NEXT_DUE_DATE_NOT_AFTER, 422);
        }
        await tx
          .insert(d)
          .values(this.scope.forInsert({ obligationId: id, dueDate: input.nextDueDate }));
      }
      await this.audit.log(
        {
          action: 'obligation_due_date.complete',
          entityType: 'obligation_due_date',
          entityId: input.dueDateId,
          changes: {
            after: { dueDate: done.dueDate, nextDueDate: input.nextDueDate ?? null },
          },
        },
        tx,
      );
      return this.get(id, tx);
    });
  }

  /** CA-8: crea el pendiente si no hay, o le cambia la fecha. */
  async setPending(id: string, input: PendingDueDate): Promise<ObligationDetail> {
    return this.db.transaction(async (tx) => {
      const { pending } = await this.get(id, tx);
      let dueDateId: string;
      if (pending) {
        const [row] = await tx
          .update(d)
          .set(this.scope.forUpdate({ dueDate: input.dueDate }))
          .where(and(this.scope.where(d), eq(d.id, pending.id), isNull(d.completedAt)))
          .returning({ id: d.id });
        if (!row) throw new DomainError(ErrorCode.DUE_DATE_ALREADY_COMPLETED, 409);
        dueDateId = row.id;
      } else {
        const [row] = await tx
          .insert(d)
          .values(this.scope.forInsert({ obligationId: id, dueDate: input.dueDate }))
          .returning({ id: d.id });
        if (!row) throw new Error('Insert returned no rows');
        dueDateId = row.id;
      }
      await this.audit.log(
        {
          action: 'obligation_due_date.set',
          entityType: 'obligation_due_date',
          entityId: dueDateId,
          changes: {
            before: pending ? { dueDate: pending.dueDate } : null,
            after: { dueDate: input.dueDate },
          },
        },
        tx,
      );
      return this.get(id, tx);
    });
  }

  /** CA-8: quita el pendiente (la obligación deja de aplicar o se corrige). */
  async removePending(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const { pending } = await this.get(id, tx);
      const noPending = () => new DomainError(ErrorCode.NO_PENDING_DUE_DATE, 409);
      if (!pending) throw noPending();
      const [row] = await tx
        .update(d)
        .set(this.scope.forSoftDelete())
        .where(and(this.scope.where(d), eq(d.id, pending.id), isNull(d.completedAt)))
        .returning({ id: d.id });
      if (!row) throw noPending();
      await this.audit.log(
        {
          action: 'obligation_due_date.delete',
          entityType: 'obligation_due_date',
          entityId: pending.id,
          changes: { before: { dueDate: pending.dueDate } },
        },
        tx,
      );
    });
  }

  async remove(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const before = await this.get(id, tx);
      // Si otro borrado confirmó primero, la fila ya no cumple el WHERE: 404 y sin auditoría.
      const [row] = await tx
        .update(o)
        .set(this.scope.forSoftDelete())
        .where(and(this.scope.where(o), eq(o.id, id)))
        .returning({ id: o.id });
      if (!row) throw notFound();
      await this.audit.log(
        {
          action: 'obligation.delete',
          entityType: 'obligation',
          entityId: id,
          changes: { before: auditable(before) },
        },
        tx,
      );
    });
  }
}
