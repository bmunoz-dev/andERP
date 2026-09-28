import { Injectable } from '@nestjs/common';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { ClsService } from 'nestjs-cls';
import type { Actor, RequestContext } from '../context/request-context';

interface OrgScopedTable {
  organizationId: PgColumn;
  deletedAt: PgColumn;
}

/**
 * Aislamiento por organización (constitución, principio IV). Todo acceso a tablas de una
 * organización pasa por aquí: filtra por la organización del actor, excluye los borrados y
 * llena las columnas de auditoría. Sin actor en el contexto, falla: es un error de programación.
 */
@Injectable()
export class OrgScope {
  constructor(private readonly cls: ClsService<RequestContext>) {}

  get organizationId(): string {
    return this.actor().organizationId;
  }

  get userId(): string {
    return this.actor().userId;
  }

  where(table: OrgScopedTable): SQL {
    const condition = and(eq(table.organizationId, this.organizationId), isNull(table.deletedAt));
    if (!condition) throw new Error('Unreachable: and() with conditions returned undefined');
    return condition;
  }

  forInsert<T extends object>(
    values: T,
  ): T & { organizationId: string; createdBy: string; updatedBy: string } {
    const { organizationId, userId } = this.actor();
    return { ...values, organizationId, createdBy: userId, updatedBy: userId };
  }

  forUpdate<T extends object>(values: T): T & { updatedAt: Date; updatedBy: string } {
    return { ...values, updatedAt: new Date(), updatedBy: this.userId };
  }

  forSoftDelete(): { deletedAt: Date; deletedBy: string } {
    return { deletedAt: new Date(), deletedBy: this.userId };
  }

  private actor(): Actor {
    const actor = this.cls.get('actor');
    if (!actor) throw new Error('OrgScope used without an organization context (missing actor)');
    return actor;
  }
}
