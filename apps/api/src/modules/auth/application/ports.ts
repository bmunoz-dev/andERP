import type { AuthProfile, MemberRole } from '@anderp/shared';

// ── Datos que la capa de aplicación necesita de la persistencia ───────────────────────────

export type UserStatus = 'active' | 'locked' | 'inactive';
export type OrganizationStatus = 'active' | 'suspended';
export type PasswordResetPurpose = 'reset' | 'invite';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
  status: UserStatus;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

export interface MembershipRecord {
  organizationId: string;
  organizationName: string;
  organizationStatus: OrganizationStatus;
  role: MemberRole;
}

export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface PasswordResetRecord {
  id: string;
  userId: string;
  purpose: PasswordResetPurpose;
  expiresAt: Date;
  usedAt: Date | null;
}

// ── Puertos ───────────────────────────────────────────────────────────────────────────────

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  /** Membresía activa más antigua del usuario (la v1 opera una sola organización). */
  findMembership(userId: string): Promise<MembershipRecord | null>;
  recordFailedLogin(userId: string, attempts: number, lockedUntil: Date | null): Promise<void>;
  recordSuccessfulLogin(userId: string, at: Date, rehashedPassword: string | null): Promise<void>;
  /** Cambia la contraseña y reinicia el contador de intentos y el bloqueo. */
  updatePassword(userId: string, passwordHash: string): Promise<void>;
}

export interface NewSession {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
}

export interface SessionRepository {
  create(session: NewSession): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  /** Revoca solo si seguía activa. Devuelve `false` si otra petición ya la había revocado. */
  revokeIfActive(sessionId: string, at: Date): Promise<boolean>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
  revokeAllForUser(userId: string, at: Date, exceptFamilyId?: string): Promise<void>;
  /**
   * `true` si la familia tiene una sesión sin revocar ni vencer. El guard lo consulta en cada
   * petición: así un logout o un cambio de contraseña invalidan también los access tokens.
   */
  isFamilyActive(familyId: string, at: Date): Promise<boolean>;
}

export interface PasswordResetRepository {
  create(input: {
    userId: string;
    purpose: PasswordResetPurpose;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetRecord | null>;
  /** Marca como usado solo si no lo estaba. Devuelve `false` si ya se había usado. */
  markUsedIfUnused(id: string, at: Date): Promise<boolean>;
  invalidateOpen(userId: string, purpose: PasswordResetPurpose, at: Date): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  needsRehash(hash: string): boolean;
  /**
   * Verifica contra un hash ficticio. Iguala el tiempo de respuesta cuando el email no existe,
   * para que no se pueda averiguar qué cuentas existen (F01 CA-2).
   */
  verifyDummy(password: string): Promise<void>;
}

export interface AccessTokenClaims {
  sub: string;
  org: string;
  role: MemberRole;
  sa: boolean;
  /** `family_id` de la sesión. */
  sid: string;
}

export interface AccessTokenIssuer {
  issue(claims: AccessTokenClaims): Promise<string>;
}

/** Tokens opacos (refresh, recuperación): aleatorios, y en la base de datos solo su hash. */
export interface OpaqueTokens {
  generate(): string;
  hash(token: string): string;
}

export interface Clock {
  now(): Date;
}

export interface CommonPasswords {
  readonly list: ReadonlySet<string>;
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthProfile;
}

// ── Tokens de inyección ───────────────────────────────────────────────────────────────────

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
export const PASSWORD_RESET_REPOSITORY = Symbol('PASSWORD_RESET_REPOSITORY');
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const ACCESS_TOKEN_ISSUER = Symbol('ACCESS_TOKEN_ISSUER');
export const OPAQUE_TOKENS = Symbol('OPAQUE_TOKENS');
export const CLOCK = Symbol('CLOCK');
export const COMMON_PASSWORDS = Symbol('COMMON_PASSWORDS');
