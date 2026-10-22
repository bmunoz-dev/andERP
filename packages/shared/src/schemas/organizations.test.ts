import { describe, expect, it } from 'vitest';
import { authProfileSchema } from './auth';
import { createOrganizationSchema, updateOrganizationSchema } from './organizations';

describe('módulos de la organización (F19)', () => {
  const create = {
    name: 'Cliente',
    taxId: '900123456-7',
    admin: { email: 'a@b.co', firstName: 'Ana', lastName: 'Pérez' },
  };

  it('CA-4 al crear, sin `modules` queda vacío y los repetidos se descartan', () => {
    expect(createOrganizationSchema.parse(create).modules).toEqual([]);
    const parsed = createOrganizationSchema.parse({
      ...create,
      modules: ['agenda', 'credentials', 'agenda'],
    });
    expect(parsed.modules).toEqual(['agenda', 'credentials']);
  });

  it('CA-4 rechaza un paquete que no existe', () => {
    expect(createOrganizationSchema.safeParse({ ...create, modules: ['base'] }).success).toBe(
      false,
    );
    expect(updateOrganizationSchema.safeParse({ modules: ['inventado'] }).success).toBe(false);
  });

  it('CA-4 `modules` solo (incluso vacío) es un cambio válido; nada es "Nada que actualizar"', () => {
    expect(updateOrganizationSchema.parse({ modules: [] })).toEqual({ modules: [] });
    expect(updateOrganizationSchema.safeParse({}).success).toBe(false);
  });

  it('CA-15 el perfil lleva `modules`', () => {
    const profile = {
      id: crypto.randomUUID(),
      email: 'a@b.co',
      firstName: 'Ana',
      lastName: 'Pérez',
      isSuperAdmin: false,
      organization: { id: crypto.randomUUID(), name: 'Cliente' },
      organizations: [],
      role: 'admin',
    };
    expect(authProfileSchema.safeParse(profile).success).toBe(false);
    expect(authProfileSchema.parse({ ...profile, modules: ['agenda'] }).modules).toEqual([
      'agenda',
    ]);
  });
});
