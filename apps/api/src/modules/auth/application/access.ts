import type { AuthProfile } from '@anderp/shared';
import { authErrors } from '../domain/auth-errors';
import type { MembershipRecord, UserRecord } from './ports';

export interface Access {
  user: UserRecord;
  membership: MembershipRecord;
}

/**
 * Reglas para usar AndERP (F01 CA-4 y CA-11): el usuario debe estar activo y tener una
 * membresía; si no es super admin, su organización no puede estar suspendida.
 */
export function requireAccess(
  user: UserRecord | null,
  membership: MembershipRecord | null,
  status: 401 | 403 = 403,
): Access {
  if (!user || user.status !== 'active' || !membership) throw authErrors.accountDisabled(status);
  if (!user.isSuperAdmin && membership.organizationStatus === 'suspended') {
    throw authErrors.accountDisabled(status);
  }
  return { user, membership };
}

export function toProfile({ user, membership }: Access): AuthProfile {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isSuperAdmin: user.isSuperAdmin,
    organization: { id: membership.organizationId, name: membership.organizationName },
    role: membership.role,
  };
}
