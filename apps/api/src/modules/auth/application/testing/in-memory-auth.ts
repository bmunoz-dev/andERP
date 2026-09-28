import { createHash, randomUUID } from 'node:crypto';
import type { AuditEntry, AuditLogger } from '../../../audit/audit.service';
import type { MailMessage, Mailer } from '../../../mail/mailer';
import type {
  AccessTokenClaims,
  AccessTokenIssuer,
  Clock,
  MembershipRecord,
  NewSession,
  OpaqueTokens,
  PasswordHasher,
  PasswordResetPurpose,
  PasswordResetRecord,
  PasswordResetRepository,
  SessionRecord,
  SessionRepository,
  UserRecord,
  UserRepository,
} from '../ports';

/** Dobles en memoria de los puertos de auth, para probar los casos de uso sin base de datos. */

export class FakeClock implements Clock {
  constructor(public current = new Date('2026-09-28T10:00:00Z')) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/** "Hash" legible: `hashed:<clave>`. `needsRehash` es verdadero para el prefijo `old:`. */
export class FakeHasher implements PasswordHasher {
  dummyVerifications = 0;
  hash(password: string): Promise<string> {
    return Promise.resolve(`hashed:${password}`);
  }
  verify(hash: string, password: string): Promise<boolean> {
    return Promise.resolve(hash === `hashed:${password}` || hash === `old:${password}`);
  }
  needsRehash(hash: string): boolean {
    return hash.startsWith('old:');
  }
  verifyDummy(): Promise<void> {
    this.dummyVerifications++;
    return Promise.resolve();
  }
}

export class FakeTokens implements OpaqueTokens {
  private counter = 0;
  generate(): string {
    this.counter++;
    return `token-${this.counter}`;
  }
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

export class FakeAccessTokens implements AccessTokenIssuer {
  issued: AccessTokenClaims[] = [];
  issue(claims: AccessTokenClaims): Promise<string> {
    this.issued.push(claims);
    return Promise.resolve(`access:${claims.sub}:${claims.sid}`);
  }
}

export class FakeAudit implements AuditLogger {
  entries: AuditEntry[] = [];
  log(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
  actions(): string[] {
    return this.entries.map((e) => e.action);
  }
}

export class FakeMailer implements Mailer {
  sent: MailMessage[] = [];
  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

export class InMemoryUsers implements UserRepository {
  users = new Map<string, UserRecord>();
  memberships = new Map<string, MembershipRecord>();
  lastLoginAt = new Map<string, Date>();

  add(
    user: Partial<UserRecord> & { email: string },
    membership?: Partial<MembershipRecord>,
  ): UserRecord {
    const record: UserRecord = {
      id: randomUUID(),
      passwordHash: 'hashed:correct horse battery',
      firstName: 'Ana',
      lastName: 'Gómez',
      isSuperAdmin: false,
      status: 'active',
      failedLoginAttempts: 0,
      lockedUntil: null,
      ...user,
    };
    this.users.set(record.id, record);
    if (membership !== undefined) {
      this.memberships.set(record.id, {
        organizationId: 'org-1',
        organizationName: 'Empresa',
        organizationStatus: 'active',
        role: 'admin',
        ...membership,
      });
    }
    return record;
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    const lower = email.toLowerCase();
    return Promise.resolve(
      [...this.users.values()].find((u) => u.email.toLowerCase() === lower) ?? null,
    );
  }
  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }
  findMembership(userId: string): Promise<MembershipRecord | null> {
    return Promise.resolve(this.memberships.get(userId) ?? null);
  }
  recordFailedLogin(userId: string, attempts: number, lockedUntil: Date | null): Promise<void> {
    const user = this.users.get(userId)!;
    this.users.set(userId, { ...user, failedLoginAttempts: attempts, lockedUntil });
    return Promise.resolve();
  }
  recordSuccessfulLogin(userId: string, at: Date, rehashed: string | null): Promise<void> {
    const user = this.users.get(userId)!;
    this.users.set(userId, {
      ...user,
      failedLoginAttempts: 0,
      lockedUntil: null,
      passwordHash: rehashed ?? user.passwordHash,
    });
    this.lastLoginAt.set(userId, at);
    return Promise.resolve();
  }
  updatePassword(userId: string, passwordHash: string): Promise<void> {
    const user = this.users.get(userId)!;
    this.users.set(userId, { ...user, passwordHash, failedLoginAttempts: 0, lockedUntil: null });
    return Promise.resolve();
  }
}

export class InMemorySessions implements SessionRepository {
  rows: (SessionRecord & { tokenHash: string })[] = [];

  create(session: NewSession): Promise<void> {
    this.rows.push({
      id: randomUUID(),
      userId: session.userId,
      familyId: session.familyId,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt,
      revokedAt: null,
    });
    return Promise.resolve();
  }
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return Promise.resolve(this.rows.find((r) => r.tokenHash === tokenHash) ?? null);
  }
  revokeIfActive(sessionId: string, at: Date): Promise<boolean> {
    const row = this.rows.find((r) => r.id === sessionId && r.revokedAt === null);
    if (row) row.revokedAt = at;
    return Promise.resolve(Boolean(row));
  }
  revokeFamily(familyId: string, at: Date): Promise<void> {
    for (const row of this.rows)
      if (row.familyId === familyId && !row.revokedAt) row.revokedAt = at;
    return Promise.resolve();
  }
  revokeAllForUser(userId: string, at: Date, exceptFamilyId?: string): Promise<void> {
    for (const row of this.rows) {
      if (row.userId === userId && row.familyId !== exceptFamilyId && !row.revokedAt)
        row.revokedAt = at;
    }
    return Promise.resolve();
  }
  isFamilyActive(familyId: string, at: Date): Promise<boolean> {
    return Promise.resolve(
      this.rows.some(
        (r) =>
          r.familyId === familyId && r.revokedAt === null && r.expiresAt.getTime() > at.getTime(),
      ),
    );
  }
  active(): SessionRecord[] {
    return this.rows.filter((r) => r.revokedAt === null);
  }
}

export class InMemoryResets implements PasswordResetRepository {
  rows: (PasswordResetRecord & { tokenHash: string })[] = [];

  create(input: {
    userId: string;
    purpose: PasswordResetPurpose;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    this.rows.push({ id: randomUUID(), usedAt: null, ...input });
    return Promise.resolve();
  }
  findByTokenHash(tokenHash: string): Promise<PasswordResetRecord | null> {
    return Promise.resolve(this.rows.find((r) => r.tokenHash === tokenHash) ?? null);
  }
  markUsedIfUnused(id: string, at: Date): Promise<boolean> {
    const row = this.rows.find((r) => r.id === id && r.usedAt === null);
    if (row) row.usedAt = at;
    return Promise.resolve(Boolean(row));
  }
  invalidateOpen(userId: string, purpose: PasswordResetPurpose, at: Date): Promise<void> {
    for (const row of this.rows) {
      if (row.userId === userId && row.purpose === purpose && !row.usedAt) row.usedAt = at;
    }
    return Promise.resolve();
  }
}
