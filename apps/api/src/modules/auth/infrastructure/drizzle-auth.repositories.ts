import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { DB, type Database } from '../../../db/database.module';
import {
  organizationMembers,
  organizations,
  passwordResets,
  sessions,
  users,
} from '../../../db/schema';
import type {
  MembershipRecord,
  NewSession,
  PasswordResetPurpose,
  PasswordResetRecord,
  PasswordResetRepository,
  SessionRecord,
  SessionRepository,
  UserRecord,
  UserRepository,
} from '../application/ports';

const userColumns = {
  id: users.id,
  email: users.email,
  passwordHash: users.passwordHash,
  firstName: users.firstName,
  lastName: users.lastName,
  isSuperAdmin: users.isSuperAdmin,
  status: users.status,
  failedLoginAttempts: users.failedLoginAttempts,
  lockedUntil: users.lockedUntil,
};

@Injectable()
export class DrizzleUserRepository implements UserRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const [row] = await this.db
      .select(userColumns)
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const [row] = await this.db
      .select(userColumns)
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async findMembership(userId: string): Promise<MembershipRecord | null> {
    const [row] = await this.db
      .select({
        organizationId: organizations.id,
        organizationName: organizations.name,
        organizationStatus: organizations.status,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.isActive, true),
          isNull(organizationMembers.deletedAt),
          isNull(organizations.deletedAt),
        ),
      )
      .orderBy(asc(organizationMembers.createdAt))
      .limit(1);
    return row ?? null;
  }

  async recordFailedLogin(
    userId: string,
    attempts: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    await this.db
      .update(users)
      .set({ failedLoginAttempts: attempts, lockedUntil, updatedAt: sql`now()` })
      .where(eq(users.id, userId));
  }

  async recordSuccessfulLogin(userId: string, at: Date, rehashed: string | null): Promise<void> {
    await this.db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: at,
        ...(rehashed ? { passwordHash: rehashed } : {}),
      })
      .where(eq(users.id, userId));
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: sql`now()`,
        updatedBy: userId,
      })
      .where(eq(users.id, userId));
  }
}

@Injectable()
export class DrizzleSessionRepository implements SessionRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(session: NewSession): Promise<void> {
    await this.db.insert(sessions).values(session);
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const [row] = await this.db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        familyId: sessions.familyId,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
      })
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  async revokeIfActive(sessionId: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(sessions)
      .set({ revokedAt: at })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return rows.length > 0;
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: at })
      .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
  }

  async isFamilyActive(familyId: string, at: Date): Promise<boolean> {
    const [row] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.familyId, familyId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, at),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async revokeAllForUser(userId: string, at: Date, exceptFamilyId?: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: at })
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          exceptFamilyId ? ne(sessions.familyId, exceptFamilyId) : undefined,
        ),
      );
  }
}

@Injectable()
export class DrizzlePasswordResetRepository implements PasswordResetRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(input: {
    userId: string;
    purpose: PasswordResetPurpose;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.db.insert(passwordResets).values(input);
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetRecord | null> {
    const [row] = await this.db
      .select({
        id: passwordResets.id,
        userId: passwordResets.userId,
        purpose: passwordResets.purpose,
        expiresAt: passwordResets.expiresAt,
        usedAt: passwordResets.usedAt,
      })
      .from(passwordResets)
      .where(eq(passwordResets.tokenHash, tokenHash))
      .limit(1);
    return row ? { ...row, purpose: row.purpose as PasswordResetPurpose } : null;
  }

  async markUsedIfUnused(id: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(passwordResets)
      .set({ usedAt: at })
      .where(and(eq(passwordResets.id, id), isNull(passwordResets.usedAt)))
      .returning({ id: passwordResets.id });
    return rows.length > 0;
  }

  async invalidateOpen(userId: string, purpose: PasswordResetPurpose, at: Date): Promise<void> {
    await this.db
      .update(passwordResets)
      .set({ usedAt: at })
      .where(
        and(
          eq(passwordResets.userId, userId),
          eq(passwordResets.purpose, purpose),
          isNull(passwordResets.usedAt),
        ),
      );
  }
}
