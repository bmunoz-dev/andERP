import { describe, expect, it } from 'vitest';
import { navigationFor } from './navigation';

describe('navigationFor (F02 CA-18)', () => {
  it('un admin ve Operación y Configuración, pero no Plataforma', () => {
    const groups = navigationFor({ isSuperAdmin: false });
    expect(groups.map((g) => g.label)).toEqual(['Operación', 'Configuración']);
    expect(groups[0]?.items.map((i) => i.label)).toEqual([
      'Inicio',
      'Egresos',
      'Honorarios',
      'Prestadores',
      'Credenciales',
      'Responsables',
    ]);
    expect(groups[1]?.items.map((i) => i.to)).toEqual([
      '/configuracion/categorias',
      '/configuracion/usuarios',
    ]);
  });

  it('el super admin además ve Plataforma', () => {
    const groups = navigationFor({ isSuperAdmin: true });
    expect(groups.map((g) => g.label)).toEqual(['Operación', 'Configuración', 'Plataforma']);
    expect(groups[2]?.items.map((i) => i.to)).toEqual([
      '/plataforma/organizaciones',
      '/plataforma/catalogos',
    ]);
  });
});
