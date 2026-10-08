import {
  type Credential,
  ErrorCode,
  type RevealedPassword,
  type SaveCredential,
  type UpdateCredential,
} from '@anderp/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, or, type SQL, sql } from 'drizzle-orm';
import { InjectPinoLogger, type PinoLogger } from 'nestjs-pino';
import { v7 as uuidv7 } from 'uuid';
import { DB, type Database } from '../../db/database.module';
import { entityCredentials, responsiblePersons } from '../../db/schema';
import { OrgScope } from '../../shared/db/org-scope';
import { DomainError } from '../../shared/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../audit/audit.service';
import { CredentialCipher, credentialAad, type EncryptedSecret } from './credential-cipher';

const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const notFound = () => new DomainError(ErrorCode.NOT_FOUND, 404);

const responsibleName = sql<string>`${responsiblePersons.firstName} || ' ' || ${responsiblePersons.lastName}`;

/** Lo único que sale de la tabla hacia la API: nunca la contraseña ni los campos cifrados (CA-5). */
const columns = {
  id: entityCredentials.id,
  entityName: entityCredentials.entityName,
  username: entityCredentials.username,
  url: entityCredentials.url,
  contact1: entityCredentials.contact1,
  contact2: entityCredentials.contact2,
  notes: entityCredentials.notes,
  responsibleId: responsiblePersons.id,
  responsibleName,
};

type Row = Omit<Credential, 'hasPassword' | 'responsiblePerson'> & {
  responsibleId: string | null;
  responsibleName: string | null;
};

function toCredential({ responsibleId, responsibleName: name, ...row }: Row): Credential {
  return {
    ...row,
    hasPassword: true,
    responsiblePerson: responsibleId ? { id: responsibleId, name: name ?? '' } : null,
  };
}

const auditable = ({ hasPassword: _h, responsiblePerson, ...rest }: Credential) => ({
  ...rest,
  responsiblePersonId: responsiblePerson?.id ?? null,
});

/**
 * Credenciales de portales externos (F06 CA-3 a CA-9). La contraseña se cifra con el AAD
 * `"{organizationId}:{id}"`, por eso el `id` se genera antes de cifrar.
 */
@Injectable()
export class CredentialsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    private readonly scope: OrgScope,
    private readonly cipher: CredentialCipher,
    @InjectPinoLogger(CredentialsService.name) private readonly logger: PinoLogger,
  ) {}

  private query(where: SQL | undefined) {
    return this.db
      .select(columns)
      .from(entityCredentials)
      .leftJoin(
        responsiblePersons,
        and(
          eq(responsiblePersons.organizationId, entityCredentials.organizationId),
          eq(responsiblePersons.id, entityCredentials.responsiblePersonId),
        ),
      )
      .where(and(this.scope.where(entityCredentials), where))
      .orderBy(asc(entityCredentials.entityName), asc(entityCredentials.username));
  }

  /** CA-9: busca por entidad, usuario o nombre del responsable. */
  async list(search?: string): Promise<Credential[]> {
    const pattern = search?.trim() ? likePattern(search.trim()) : null;
    const rows = await this.query(
      pattern
        ? or(
            ilike(entityCredentials.entityName, pattern),
            ilike(entityCredentials.username, pattern),
            ilike(responsibleName, pattern),
          )
        : undefined,
    );
    return rows.map(toCredential);
  }

  async get(id: string): Promise<Credential> {
    const [row] = await this.query(eq(entityCredentials.id, id));
    if (!row) throw notFound();
    return toCredential(row);
  }

  async create(input: SaveCredential): Promise<Credential> {
    const id = uuidv7();
    await this.db.insert(entityCredentials).values(
      this.scope.forInsert({
        id,
        entityName: input.entityName,
        username: input.username,
        url: input.url ?? null,
        contact1: input.contact1 ?? null,
        contact2: input.contact2 ?? null,
        notes: input.notes ?? null,
        responsiblePersonId: input.responsiblePersonId ?? null,
        ...this.encrypt(id, input.password),
      }),
    );
    return this.get(id);
  }

  /** CA-7: sin `password`, la contraseña guardada no cambia. */
  async update(id: string, changes: UpdateCredential): Promise<Credential> {
    const before = await this.get(id);
    const { password, ...rest } = changes;
    await this.db
      .update(entityCredentials)
      .set(
        this.scope.forUpdate({
          ...this.fields(rest),
          ...(password !== undefined ? this.encrypt(id, password) : {}),
        }),
      )
      .where(and(this.scope.where(entityCredentials), eq(entityCredentials.id, id)));
    const after = await this.get(id);
    await this.audit.log({
      action: 'credential.update',
      entityType: 'credential',
      entityId: id,
      changes: {
        before: auditable(before),
        after: auditable(after),
        ...(password !== undefined ? { passwordChanged: true } : {}),
      },
    });
    return after;
  }

  async remove(id: string): Promise<void> {
    const [row] = await this.db
      .update(entityCredentials)
      .set(this.scope.forSoftDelete())
      .where(and(this.scope.where(entityCredentials), eq(entityCredentials.id, id)))
      .returning({ id: entityCredentials.id });
    if (!row) throw notFound();
  }

  /** CA-6: devuelve la contraseña y deja constancia de quién la vio (sin la contraseña). */
  async reveal(id: string): Promise<RevealedPassword> {
    const [secret] = await this.db
      .select({
        ciphertext: entityCredentials.passwordCiphertext,
        iv: entityCredentials.passwordIv,
        authTag: entityCredentials.passwordAuthTag,
        keyVersion: entityCredentials.keyVersion,
      })
      .from(entityCredentials)
      .where(and(this.scope.where(entityCredentials), eq(entityCredentials.id, id)));
    if (!secret) throw notFound();
    const password = this.decrypt(id, secret);
    await this.audit.log({ action: 'credential.reveal', entityType: 'credential', entityId: id });
    return { password };
  }

  private decrypt(id: string, secret: EncryptedSecret): string {
    try {
      return this.cipher.decrypt(secret, credentialAad(this.scope.organizationId, id));
    } catch (error) {
      // CA-8: un texto cifrado que no corresponde a su registro es un problema de integridad.
      if (error instanceof DomainError && error.code === ErrorCode.CREDENTIAL_DECRYPT_FAILED) {
        this.logger.error({ credentialId: id }, 'Credential integrity check failed');
      }
      throw error;
    }
  }

  private encrypt(id: string, password: string) {
    const secret = this.cipher.encrypt(password, credentialAad(this.scope.organizationId, id));
    return {
      passwordCiphertext: secret.ciphertext,
      passwordIv: secret.iv,
      passwordAuthTag: secret.authTag,
      keyVersion: secret.keyVersion,
    };
  }

  private fields(input: Omit<UpdateCredential, 'password'>) {
    const keys = [
      'entityName',
      'username',
      'url',
      'contact1',
      'contact2',
      'notes',
      'responsiblePersonId',
    ] as const;
    return Object.fromEntries(
      keys.filter((k) => input[k] !== undefined).map((k) => [k, input[k]]),
    ) as Partial<typeof entityCredentials.$inferInsert>;
  }
}
