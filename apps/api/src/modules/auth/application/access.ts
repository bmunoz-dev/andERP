import type { AuthProfile } from '@anderp/shared';
import { authErrors } from '../domain/auth-errors';
import type { MembershipRecord, UserRecord } from './ports';

export interface Access {
  user: UserRecord;
  /** Organización activa. */
  membership: MembershipRecord;
  /** Todas las disponibles para el usuario, en el orden de entrada. */
  organizations: MembershipRecord[];
}

/**
 * Reglas para usar AndERP (F01 CA-4 y CA-11, F20 CA-3): el usuario debe estar activo y tener
 * al menos una organización disponible; si no es super admin, las suspendidas no cuentan.
 * `memberships` llega ordenada por preferencia: la organización activa es `preferredOrgId` si
 * está disponible y, si no, la primera.
 */
export function requireAccess(
  user: UserRecord | null,
  memberships: MembershipRecord[],
  preferredOrgId: string | null,
  status: 401 | 403 = 403,
): Access {
  const organizations = memberships.filter(
    (m) => user?.isSuperAdmin === true || m.organizationStatus !== 'suspended',
  );
  const first = organizations[0];
  if (!user || user.status !== 'active' || !first) throw authErrors.accountDisabled(status);
  const membership = organizations.find((m) => m.organizationId === preferredOrgId) ?? first;
  return { user, membership, organizations };
}

export function toProfile({ user, membership, organizations }: Access): AuthProfile {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isSuperAdmin: user.isSuperAdmin,
    organization: { id: membership.organizationId, name: membership.organizationName },
    organizations: organizations
      .map((m) => ({ id: m.organizationId, name: m.organizationName }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    role: membership.role,
    modules: membership.modules,
  };
}
