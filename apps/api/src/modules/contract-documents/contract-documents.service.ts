import {
  CONTRACT_DOCUMENT_MAX_BYTES,
  type ContractDocument,
  type ContractDocumentType,
  ErrorCode,
} from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gt } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { DB, type Database } from '../../db/database.module';
import { contractDocuments, providerContracts } from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit.service';
import {
  contentDisposition,
  detectDocumentType,
  normalizeFileName,
} from './contract-document-rules';
import { ObjectStorage } from './object-storage';

/** F17 CA-9: la URL firmada dura 5 minutos. */
const URL_TTL_SECONDS = 300;

/** F17 CA-6c: el bucket solo crece y pasar el 1 GB gratuito restringe todo el proyecto. */
const UPLOADS_PER_HOUR = 20;

const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);

/** Lo que queda en la auditoría: sin la ruta del objeto (sigue en la fila). */
function auditable(d: { fileName: string; sizeBytes: number; sha256: string }) {
  return { fileName: d.fileName, sizeBytes: d.sizeBytes, sha256: d.sha256 };
}

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

/**
 * Documento del contrato (F17). Nunca se borran objetos del bucket: reemplazar y eliminar solo
 * marcan la fila (design.md §5.13).
 */
@Injectable()
export class ContractDocumentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly scope: OrgScope,
    private readonly storage: ObjectStorage,
  ) {}

  async upload(contractId: string, file: UploadedFile | undefined): Promise<ContractDocument> {
    // Antes de tocar el bucket, para no dejar objetos huérfanos por un 404 (CA-6b, CA-14).
    await this.assertContract(contractId);
    await this.assertUploadLimit();

    const fileName = file ? normalizeFileName(file.originalname) : null;
    if (!file || file.size === 0 || !fileName) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 422);
    }
    if (file.size > CONTRACT_DOCUMENT_MAX_BYTES) {
      throw new DomainError(ErrorCode.DOCUMENT_TOO_LARGE, 422);
    }
    const contentType = detectDocumentType(file.buffer, fileName);
    if (!contentType) throw new DomainError(ErrorCode.DOCUMENT_TYPE_NOT_ALLOWED, 422);

    const document = {
      fileName,
      contentType,
      sizeBytes: file.size,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
      storageKey: `org/${this.scope.organizationId}/contracts/${contractId}/${randomUUID()}`,
    };
    // ponytail: si la transacción falla, el objeto queda huérfano en el bucket (CA-7); no hace
    // daño y nunca se borran objetos.
    await this.storage.put(document.storageKey, file.buffer, contentType);

    return this.db.transaction(async (tx) => {
      // Bloquea el contrato: dos subidas simultáneas se reemplazan en orden (CA-6).
      const [locked] = await tx
        .select({ id: providerContracts.id })
        .from(providerContracts)
        .where(and(this.scope.where(providerContracts), eq(providerContracts.id, contractId)))
        .for('update');
      if (!locked) throw notFound();

      const [before] = await tx
        .update(contractDocuments)
        .set(this.scope.forSoftDelete())
        .where(
          and(this.scope.where(contractDocuments), eq(contractDocuments.contractId, contractId)),
        )
        .returning();
      const [row] = await tx
        .insert(contractDocuments)
        .values(this.scope.forInsert({ contractId, ...document }))
        .returning();
      if (!row) throw new Error('Insert returned no rows');

      await this.audit.log(
        {
          action: before ? 'contract_document.replace' : 'contract_document.upload',
          entityType: 'contract_document',
          entityId: row.id,
          changes: before
            ? { before: auditable(before), after: auditable(row) }
            : { after: auditable(row) },
        },
        tx,
      );
      return {
        fileName: row.fileName,
        contentType: row.contentType as ContractDocumentType,
        sizeBytes: row.sizeBytes,
        uploadedAt: row.createdAt.toISOString(),
      };
    });
  }

  /** CA-9: la disposición (abrir el PDF, descargar el Word) va en la URL firmada. */
  async signedUrl(contractId: string): Promise<{ url: string; expiresAt: string }> {
    const document = await this.current(contractId);
    const expiresAt = new Date(Date.now() + URL_TTL_SECONDS * 1000).toISOString();
    const url = await this.storage.signedUrl(
      document.storageKey,
      URL_TTL_SECONDS,
      contentDisposition(document.contentType as ContractDocumentType, document.fileName),
    );
    return { url, expiresAt };
  }

  /** CA-11: solo marca la fila; el objeto se queda en el bucket. */
  async remove(contractId: string): Promise<void> {
    await this.assertContract(contractId);
    await this.db.transaction(async (tx) => {
      // Si otro borrado confirmó primero, la fila ya no cumple el WHERE: 404 y sin auditoría.
      const [before] = await tx
        .update(contractDocuments)
        .set(this.scope.forSoftDelete())
        .where(
          and(this.scope.where(contractDocuments), eq(contractDocuments.contractId, contractId)),
        )
        .returning();
      if (!before) throw notFound();
      await this.audit.log(
        {
          action: 'contract_document.delete',
          entityType: 'contract_document',
          entityId: before.id,
          changes: { before: auditable(before) },
        },
        tx,
      );
    });
  }

  /** El documento vigente de un contrato vigente de la organización (CA-13, CA-14). */
  private async current(contractId: string) {
    await this.assertContract(contractId);
    const [document] = await this.db
      .select()
      .from(contractDocuments)
      .where(
        and(this.scope.where(contractDocuments), eq(contractDocuments.contractId, contractId)),
      );
    if (!document) throw notFound();
    return document;
  }

  private async assertContract(contractId: string): Promise<void> {
    const [contract] = await this.db
      .select({ id: providerContracts.id })
      .from(providerContracts)
      .where(and(this.scope.where(providerContracts), eq(providerContracts.id, contractId)));
    if (!contract) throw notFound();
  }

  /** Cuenta también las filas borradas: cada subida ocupa espacio para siempre (CA-6c). */
  private async assertUploadLimit(): Promise<void> {
    // ponytail: dos subidas simultáneas pueden pasar el límite por una; se acepta.
    const [row] = await this.db
      .select({ uploads: count() })
      .from(contractDocuments)
      .where(
        and(
          eq(contractDocuments.organizationId, this.scope.organizationId),
          eq(contractDocuments.createdBy, this.scope.userId),
          gt(contractDocuments.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
        ),
      );
    if ((row?.uploads ?? 0) >= UPLOADS_PER_HOUR) {
      throw new DomainError(ErrorCode.TOO_MANY_REQUESTS, 429);
    }
  }
}
