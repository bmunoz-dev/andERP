import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { DB, type Database } from '../../db/database.module';
import { auditLogs } from '../../db/schema';
import type { RequestContext } from '../../shared/context/request-context';

export interface AuditEntry {
  /** p. ej. `auth.login`, `expense.update`, `credential.reveal`. */
  action: string;
  entityType?: string;
  entityId?: string;
  /** Antes y después. Nunca debe incluir secretos (constitución, principio VII). */
  changes?: Record<string, unknown>;
  /** Solo cuando aún no hay usuario autenticado en el contexto (p. ej. durante el login). */
  userId?: string | null;
  organizationId?: string | null;
}

/** Puerto que usan los casos de uso; las pruebas unitarias lo reemplazan por un doble. */
export interface AuditLogger {
  log(entry: AuditEntry): Promise<void>;
}

export const AUDIT_LOGGER = Symbol('AUDIT_LOGGER');

/**
 * Escribe en `audit_logs`. Toma usuario, organización, IP y user agent del contexto de la
 * petición; los valores explícitos de la entrada tienen prioridad.
 */
@Injectable()
export class AuditService implements AuditLogger {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly cls: ClsService<RequestContext>,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    const actor = this.cls.isActive() ? this.cls.get('actor') : undefined;
    await this.db.insert(auditLogs).values({
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      changes: entry.changes ?? null,
      userId: entry.userId !== undefined ? entry.userId : (actor?.userId ?? null),
      organizationId:
        entry.organizationId !== undefined ? entry.organizationId : (actor?.organizationId ?? null),
      ip: this.cls.isActive() ? this.cls.get('ip') : null,
      userAgent: this.cls.isActive() ? this.cls.get('userAgent') : null,
    });
  }
}

@Global()
@Module({
  providers: [AuditService, { provide: AUDIT_LOGGER, useExisting: AuditService }],
  exports: [AuditService, AUDIT_LOGGER],
})
export class AuditModule {}
