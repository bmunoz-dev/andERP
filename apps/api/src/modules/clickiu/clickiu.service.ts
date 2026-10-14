import {
  type ClickiuFilters,
  type ClickiuMovement,
  type ClickiuSummary,
  daysInMonth,
  ErrorCode,
  formatIsoDate,
  parseIsoDate,
  type SaveClickiuMovement,
  todayIn,
  type UpdateClickiuMovement,
} from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lte, type SQL, sql } from 'drizzle-orm';
import { DB, type Database } from '../../db/database.module';
import { clickiuBalance, clickiuMovements as m } from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit.service';

const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);

const columns = {
  id: m.id,
  type: m.type,
  status: m.status,
  movementDate: m.movementDate,
  amount: m.amount,
  description: m.description,
};

const auditable = ({ id: _id, ...rest }: ClickiuMovement) => rest;

/** Sin `from` ni `to`: el mes actual en Bogotá (CA-10). Si llega uno, el otro queda abierto. */
function withDefaultRange(f: ClickiuFilters): ClickiuFilters {
  if (f.from || f.to) return f;
  const { year, month } = parseIsoDate(todayIn());
  return {
    ...f,
    from: formatIsoDate({ year, month, day: 1 }),
    to: formatIsoDate({ year, month, day: daysInMonth(year, month) }),
  };
}

/**
 * Movimientos y saldo de Clic Kiu (F11). Que el estado cuadre con el tipo, que el tipo no cambie
 * y que el saldo no quede negativo lo exige la base de datos (CHECK y triggers, mismo `code`).
 */
@Injectable()
export class ClickiuService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly scope: OrgScope,
  ) {}

  /** Condición de los filtros de fecha, tipo y estado (sin organización ni borrados). */
  private filtered(f: ClickiuFilters): SQL {
    return (
      and(
        f.from ? gte(m.movementDate, f.from) : undefined,
        f.to ? lte(m.movementDate, f.to) : undefined,
        f.type ? eq(m.type, f.type) : undefined,
        f.status ? eq(m.status, f.status) : undefined,
      ) ?? sql`true`
    );
  }

  list(filters: ClickiuFilters): Promise<ClickiuMovement[]> {
    return this.db
      .select(columns)
      .from(m)
      .where(and(this.scope.where(m), this.filtered(withDefaultRange(filters))))
      .orderBy(desc(m.movementDate), desc(m.createdAt));
  }

  /** CA-12: totales de lo filtrado, saldo acumulado hasta `to` y saldo actual, en una consulta. */
  async summary(filters: ClickiuFilters): Promise<ClickiuSummary> {
    const f = withDefaultRange(filters);
    const total = (condition: SQL) =>
      sql`coalesce(sum(${m.amount}) filter (where ${condition}), 0)::numeric(14, 2)::text`;
    const inFilter = this.filtered(f);
    const [row] = await this.db
      .select({
        totalRecharged: total(sql`${inFilter} and ${m.type} = 'recharge'`),
        totalSold: total(sql`${inFilter} and ${m.type} = 'sale'`),
        creditAmount: total(sql`${inFilter} and ${m.status} = 'credit'`),
        balanceAsOf: sql<string>`coalesce(sum(case when ${m.type} = 'recharge' then ${m.amount} else -${m.amount} end)
          filter (where ${f.to ? lte(m.movementDate, f.to) : sql`true`}), 0)::numeric(14, 2)::text`,
        currentBalance: sql<string>`coalesce((select ${clickiuBalance.balance} from ${clickiuBalance}
          where ${clickiuBalance.organizationId} = ${this.scope.organizationId}), 0)::numeric(14, 2)::text`,
      })
      .from(m)
      .where(this.scope.where(m));
    if (!row) throw new Error('Aggregate returned no rows');
    return row as ClickiuSummary;
  }

  async get(id: string): Promise<ClickiuMovement> {
    const [row] = await this.db
      .select(columns)
      .from(m)
      .where(and(this.scope.where(m), eq(m.id, id)));
    if (!row) throw notFound();
    return row;
  }

  async create(input: SaveClickiuMovement): Promise<ClickiuMovement> {
    const [row] = await this.db
      .insert(m)
      .values(
        this.scope.forInsert({
          type: input.type,
          status: input.status ?? null,
          movementDate: input.movementDate,
          amount: input.amount,
          description: input.description ?? null,
        }),
      )
      .returning(columns);
    if (!row) throw new Error('Insert returned no rows');
    await this.audit.log({
      action: 'clickiu_movement.create',
      entityType: 'clickiu_movement',
      entityId: row.id,
      changes: { after: auditable(row) },
    });
    return row;
  }

  async update(id: string, changes: UpdateClickiuMovement): Promise<ClickiuMovement> {
    const before = await this.get(id);
    const [after] = await this.db
      .update(m)
      .set(
        this.scope.forUpdate({
          ...(changes.type !== undefined ? { type: changes.type } : {}),
          ...(changes.status !== undefined ? { status: changes.status } : {}),
          ...(changes.movementDate !== undefined ? { movementDate: changes.movementDate } : {}),
          ...(changes.amount !== undefined ? { amount: changes.amount } : {}),
          ...(changes.description !== undefined ? { description: changes.description } : {}),
        }),
      )
      .where(and(this.scope.where(m), eq(m.id, id)))
      .returning(columns);
    if (!after) throw notFound();
    await this.audit.log({
      action: 'clickiu_movement.update',
      entityType: 'clickiu_movement',
      entityId: id,
      changes: { before: auditable(before), after: auditable(after) },
    });
    return after;
  }

  async remove(id: string): Promise<void> {
    const before = await this.get(id);
    await this.db
      .update(m)
      .set(this.scope.forSoftDelete())
      .where(and(this.scope.where(m), eq(m.id, id)));
    await this.audit.log({
      action: 'clickiu_movement.delete',
      entityType: 'clickiu_movement',
      entityId: id,
      changes: { before: auditable(before) },
    });
  }
}
