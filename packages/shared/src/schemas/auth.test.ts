import { describe, expect, it } from 'vitest';
import { authProfileSchema, switchOrganizationSchema } from './auth';

describe('selector de organización (F20)', () => {
  const org = { id: crypto.randomUUID(), name: 'Cliente' };
  const profile = {
    id: crypto.randomUUID(),
    email: 'a@b.co',
    firstName: 'Ana',
    lastName: 'Pérez',
    isSuperAdmin: false,
    organization: org,
    role: 'admin',
    modules: [],
  };

  it('CA-7 el perfil lleva la lista `organizations`', () => {
    expect(authProfileSchema.safeParse(profile).success).toBe(false);
    expect(authProfileSchema.parse({ ...profile, organizations: [org] }).organizations).toEqual([
      org,
    ]);
  });

  it('CA-8 el cambio pide el id de una organización', () => {
    expect(switchOrganizationSchema.parse({ organizationId: org.id })).toEqual({
      organizationId: org.id,
    });
    expect(switchOrganizationSchema.safeParse({ organizationId: 'no-es-uuid' }).success).toBe(
      false,
    );
    expect(switchOrganizationSchema.safeParse({}).success).toBe(false);
  });
});
