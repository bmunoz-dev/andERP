import {
  type AirAccount,
  type AirOperatorBalance,
  ErrorCode,
  type SaveAirAccount,
  type UpdateAirAccount,
} from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, type SQL, sql } from 'drizzle-orm';
import { DB, type Database, type DbExecutor } from '../../db/database.module';
import {
  airAccountBalances as b,
  airAccountMovements as m,
  airAccounts as a,
  airOperators as o,
} from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit.service';
import { AirOperatorsService } from './air-operators.service';

const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);

const money = (value: SQL) => sql<string>`coalesce(${value}, 0)::numeric(14, 2)::text`;

/** Suma de las emisiones Por cobrar de la cuenta `a`, sin borrados. */
const pendingOf = sql`(select sum(${m.amount}) from ${m} where ${m.organizationId} = ${a.organizationId}
  and ${m.accountId} = ${a.id} and ${m.type} = 'issue' and ${m.collectionStatus} = 'pending'
  and ${m.deletedAt} is null)`;

const accountFields = {
  id: a.id,
  operatorId: a.operatorId,
  operatorName: o.name,
  name: a.name,
  creditLimit: a.creditLimit,
  isActive: a.isActive,
  balance: b.balance,
  available: b.available,
  pendingCollection: money(pendingOf),
};

/** Lo que se audita de una cuenta: sus columnas propias, sin cifras calculadas. */
const auditColumns = {
  operatorId: a.operatorId,
  name: a.name,
  creditLimit: a.creditLimit,
  isActive: a.isActive,
};

/**
 * Cuentas con los operadores aéreos (F18 CA-3 a CA-5, CA-20). El saldo y el disponible salen de
 * `v_air_account_balances`; que bajar el límite no deje la cuenta sobre su cupo lo exige un trigger.
 */
@Injectable()
export class AirAccountsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly scope: OrgScope,
    private readonly operators: AirOperatorsService,
  ) {}

  /** Cuentas de la organización con su operador, saldo, disponible y lo por cobrar. */
  private accounts(db: DbExecutor, condition?: SQL) {
    return db
      .select(accountFields)
      .from(a)
      .innerJoin(o, and(eq(o.organizationId, a.organizationId), eq(o.id, a.operatorId)))
      .innerJoin(b, eq(b.accountId, a.id))
      .where(and(this.scope.where(a), condition));
  }

  list(active?: boolean): Promise<AirAccount[]> {
    return this.accounts(
      this.db,
      active === undefined ? undefined : eq(a.isActive, active),
    ).orderBy(sql`lower(${o.name})`, sql`lower(${a.name})`);
  }

  async get(id: string, db: DbExecutor = this.db): Promise<AirAccount> {
    const [row] = await this.accounts(db, eq(a.id, id));
    if (!row) throw notFound();
    return row;
  }

  /** CA-20: por operador, la suma de sus cuentas activas. */
  byOperator(): Promise<AirOperatorBalance[]> {
    return this.db
      .select({
        operatorId: o.id,
        operatorName: o.name,
        balance: money(sql`sum(${b.balance})`),
        creditLimit: money(sql`sum(${a.creditLimit})`),
        available: money(sql`sum(${b.available})`),
        pendingCollection: money(sql`sum(${pendingOf})`),
      })
      .from(a)
      .innerJoin(o, and(eq(o.organizationId, a.organizationId), eq(o.id, a.operatorId)))
      .innerJoin(b, eq(b.accountId, a.id))
      .where(and(this.scope.where(a), eq(a.isActive, true)))
      .groupBy(o.id, o.name)
      .orderBy(sql`lower(${o.name})`);
  }

  /** CA-2: el operador elegido es de la organización (si no, 404) y está activo. */
  private async assertActiveOperator(operatorId: string, db: DbExecutor) {
    const operator = await this.operators.get(operatorId, db);
    if (!operator.isActive) throw new DomainError(ErrorCode.AIR_OPERATOR_INACTIVE, 422);
  }

  async create(input: SaveAirAccount): Promise<AirAccount> {
    return this.db.transaction(async (tx) => {
      await this.assertActiveOperator(input.operatorId, tx);
      const [row] = await tx
        .insert(a)
        .values(
          this.scope.forInsert({
            operatorId: input.operatorId,
            name: input.name,
            creditLimit: input.creditLimit,
          }),
        )
        .returning({ id: a.id, ...auditColumns });
      if (!row) throw new Error('Insert returned no rows');
      const { id, ...after } = row;
      await this.audit.log(
        {
          action: 'air_account.create',
          entityType: 'air_account',
          entityId: id,
          changes: { after },
        },
        tx,
      );
      return this.get(id, tx);
    });
  }

  async update(id: string, changes: UpdateAirAccount): Promise<AirAccount> {
    return this.db.transaction(async (tx) => {
      const [before] = await tx
        .select(auditColumns)
        .from(a)
        .where(and(this.scope.where(a), eq(a.id, id)));
      if (!before) throw notFound();
      if (changes.operatorId !== undefined && changes.operatorId !== before.operatorId) {
        await this.assertActiveOperator(changes.operatorId, tx);
      }
      const [after] = await tx
        .update(a)
        .set(this.scope.forUpdate(changes))
        .where(and(this.scope.where(a), eq(a.id, id)))
        .returning(auditColumns);
      if (!after) throw notFound();
      await this.audit.log(
        {
          action: 'air_account.update',
          entityType: 'air_account',
          entityId: id,
          changes: { before, after },
        },
        tx,
      );
      return this.get(id, tx);
    });
  }
}
