import {
  type AirMovement,
  type AirMovementFilters,
  type AirMovementSummary,
  type CreateAirMovement,
  daysInMonth,
  ErrorCode,
  formatIsoDate,
  parseIsoDate,
  todayIn,
  type UpdateAirMovement,
} from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { type AnyColumn, and, desc, eq, gte, lte, type SQL, sql } from 'drizzle-orm';
import { DB, type Database, type DbExecutor } from '../../db/database.module';
import {
  airAccountBalances as b,
  airAccountMovements as m,
  airAccounts as a,
} from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit.service';

const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);

const columns = {
  id: m.id,
  accountId: m.accountId,
  type: m.type,
  movementDate: m.movementDate,
  amount: m.amount,
  description: m.description,
  pnr: m.pnr,
  ticketNumber: m.ticketNumber,
  passenger: m.passenger,
  netFare: m.netFare,
  taxes: m.taxes,
  collectionStatus: m.collectionStatus,
};

const auditable = ({ id: _id, ...rest }: AirMovement) => rest;

const money = (value: SQL) => sql<string>`coalesce(${value}, 0)::numeric(14, 2)::text`;

/** Sin `from` ni `to`: el mes actual en Bogotá (CA-21). Si llega uno, el otro queda abierto. */
function withDefaultRange(f: AirMovementFilters): AirMovementFilters {
  if (f.from || f.to) return f;
  const { year, month } = parseIsoDate(todayIn());
  return {
    ...f,
    from: formatIsoDate({ year, month, day: 1 }),
    to: formatIsoDate({ year, month, day: daysInMonth(year, month) }),
  };
}

/**
 * Libro de una cuenta aérea (F18 CA-6 a CA-18, CA-21 a CA-23). Que los campos cuadren con el tipo,
 * que el tipo y la cuenta no cambien y que el cupo alcance lo exige la base de datos (CHECK y
 * triggers, con su `code`). Aquí solo se calcula el monto de las emisiones, siempre en SQL.
 */
@Injectable()
export class AirAccountMovementsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly scope: OrgScope,
  ) {}

  /** La cuenta es de la organización (si no, 404). */
  private async account(accountId: string, db: DbExecutor = this.db) {
    const [row] = await db
      .select({ isActive: a.isActive })
      .from(a)
      .where(and(this.scope.where(a), eq(a.id, accountId)));
    if (!row) throw notFound();
    return row;
  }

  private ofAccount(accountId: string, id?: string): SQL {
    // `and()` solo devuelve undefined sin condiciones; aquí siempre hay al menos dos.
    return (
      and(this.scope.where(m), eq(m.accountId, accountId), id ? eq(m.id, id) : undefined) ??
      sql`false`
    );
  }

  /** Condición de los filtros de fecha, tipo y estado de cobro. */
  private filtered(f: AirMovementFilters): SQL {
    return (
      and(
        f.from ? gte(m.movementDate, f.from) : undefined,
        f.to ? lte(m.movementDate, f.to) : undefined,
        f.type ? eq(m.type, f.type) : undefined,
        f.collectionStatus ? eq(m.collectionStatus, f.collectionStatus) : undefined,
      ) ?? sql`true`
    );
  }

  async list(accountId: string, filters: AirMovementFilters): Promise<AirMovement[]> {
    await this.account(accountId);
    return this.db
      .select(columns)
      .from(m)
      .where(and(this.ofAccount(accountId), this.filtered(withDefaultRange(filters))))
      .orderBy(desc(m.movementDate), desc(m.createdAt));
  }

  /** CA-22: totales de lo filtrado, saldo hasta `to`, saldo actual y disponible, en una consulta. */
  async summary(accountId: string, filters: AirMovementFilters): Promise<AirMovementSummary> {
    await this.account(accountId);
    const f = withDefaultRange(filters);
    const inFilter = this.filtered(f);
    const signed = sql`case when ${m.type} = 'issue' then -${m.amount} else ${m.amount} end`;
    const fromView = (column: AnyColumn) =>
      money(sql`(select ${column} from ${b} where ${b.accountId} = ${accountId})`);
    const [row] = await this.db
      .select({
        totalIn: money(sql`sum(${m.amount}) filter (where ${inFilter} and ${m.type} <> 'issue')`),
        totalIssued: money(
          sql`sum(${m.amount}) filter (where ${inFilter} and ${m.type} = 'issue')`,
        ),
        pendingCollection: money(
          sql`sum(${m.amount}) filter (where ${inFilter} and ${m.collectionStatus} = 'pending')`,
        ),
        balanceAsOf: money(
          sql`sum(${signed}) filter (where ${f.to ? lte(m.movementDate, f.to) : sql`true`})`,
        ),
        currentBalance: fromView(b.balance),
        available: fromView(b.available),
      })
      .from(m)
      .where(this.ofAccount(accountId));
    if (!row) throw new Error('Aggregate returned no rows');
    return row;
  }

  async get(accountId: string, id: string, db: DbExecutor = this.db): Promise<AirMovement> {
    const [row] = await db.select(columns).from(m).where(this.ofAccount(accountId, id));
    if (!row) throw notFound();
    return row;
  }

  async create(accountId: string, input: CreateAirMovement): Promise<AirMovement> {
    return this.db.transaction(async (tx) => {
      if (!(await this.account(accountId, tx)).isActive) {
        throw new DomainError(ErrorCode.AIR_ACCOUNT_INACTIVE, 422);
      }
      const common = {
        accountId,
        type: input.type,
        movementDate: input.movementDate,
        description: input.description ?? null,
      };
      const values =
        input.type === 'issue'
          ? {
              ...common,
              pnr: input.pnr,
              ticketNumber: input.ticketNumber,
              passenger: input.passenger,
              netFare: input.netFare,
              taxes: input.taxes,
              collectionStatus: input.collectionStatus ?? 'pending',
              amount: sql`${input.netFare}::numeric + ${input.taxes}::numeric`,
            }
          : { ...common, amount: input.amount };
      const [row] = await tx.insert(m).values(this.scope.forInsert(values)).returning(columns);
      if (!row) throw new Error('Insert returned no rows');
      await this.audit.log(
        {
          action: 'air_account_movement.create',
          entityType: 'air_account_movement',
          entityId: row.id,
          changes: { after: auditable(row) },
        },
        tx,
      );
      return row;
    });
  }

  async update(accountId: string, id: string, changes: UpdateAirMovement): Promise<AirMovement> {
    return this.db.transaction(async (tx) => {
      const before = await this.get(accountId, id, tx);
      const set: Record<string, unknown> = Object.fromEntries(
        Object.entries(changes).filter(([, value]) => value !== undefined),
      );
      // CA-9: el monto de una emisión sigue a su tarifa y sus impuestos (los nuevos o los guardados).
      if (
        before.type === 'issue' &&
        (changes.netFare !== undefined || changes.taxes !== undefined)
      ) {
        const part = (value: string | undefined, column: AnyColumn) =>
          value !== undefined ? sql`${value}::numeric` : sql`${column}`;
        set.amount = sql`${part(changes.netFare, m.netFare)} + ${part(changes.taxes, m.taxes)}`;
      }
      const [after] = await tx
        .update(m)
        .set(this.scope.forUpdate(set))
        .where(this.ofAccount(accountId, id))
        .returning(columns);
      if (!after) throw notFound();
      await this.audit.log(
        {
          action: 'air_account_movement.update',
          entityType: 'air_account_movement',
          entityId: id,
          changes: { before: auditable(before), after: auditable(after) },
        },
        tx,
      );
      return after;
    });
  }

  async remove(accountId: string, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const before = await this.get(accountId, id, tx);
      // Si otro borrado confirmó primero, la fila ya no cumple el WHERE: 404 y sin auditoría.
      const [row] = await tx
        .update(m)
        .set(this.scope.forSoftDelete())
        .where(this.ofAccount(accountId, id))
        .returning({ id: m.id });
      if (!row) throw notFound();
      await this.audit.log(
        {
          action: 'air_account_movement.delete',
          entityType: 'air_account_movement',
          entityId: id,
          changes: { before: auditable(before) },
        },
        tx,
      );
    });
  }
}
