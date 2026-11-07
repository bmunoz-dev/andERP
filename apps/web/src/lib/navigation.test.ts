import { APP_MODULES, type AuthProfile } from '@anderp/shared';
import { describe, expect, it } from 'vitest';
import { appRedirect, moduleForPath, navigationFor } from './navigation';

const all = [...APP_MODULES];

describe('navigationFor (F02 CA-18)', () => {
  it('un admin ve Operación y Configuración, pero no Plataforma', () => {
    const groups = navigationFor({ isSuperAdmin: false, modules: all });
    expect(groups.map((g) => g.label)).toEqual(['Operación', 'Configuración']);
    expect(groups[0]?.items.map((i) => i.label)).toEqual([
      'Egresos',
      'Pagos',
      'Personal',
      'Credenciales',
      'Responsables',
      'Cuentas aéreas',
      'Agenda',
    ]);
    expect(groups[1]?.items.map((i) => i.to)).toEqual([
      '/configuracion/categorias',
      '/configuracion/operadores-aereos',
      '/configuracion/usuarios',
    ]);
  });

  it('el super admin además ve Plataforma', () => {
    const groups = navigationFor({ isSuperAdmin: true, modules: all });
    expect(groups.map((g) => g.label)).toEqual(['Operación', 'Configuración', 'Plataforma']);
    expect(groups[2]?.items.map((i) => i.to)).toEqual([
      '/plataforma/organizaciones',
      '/plataforma/catalogos',
    ]);
  });
});

describe('navigationFor con paquetes (F19 CA-16)', () => {
  it('sin paquetes solo queda Base', () => {
    const groups = navigationFor({ isSuperAdmin: false, modules: [] });
    expect(groups.map((g) => g.items.map((i) => i.label))).toEqual([
      ['Egresos'],
      ['Departamentos', 'Usuarios'],
    ]);
  });

  it('cada paquete trae sus ítems; Operadores aéreos va con air_accounts', () => {
    const groups = navigationFor({ isSuperAdmin: false, modules: ['air_accounts'] });
    expect(groups.map((g) => g.items.map((i) => i.label))).toEqual([
      ['Egresos', 'Cuentas aéreas'],
      ['Departamentos', 'Operadores aéreos', 'Usuarios'],
    ]);
  });
});

describe('moduleForPath (F19 CA-17)', () => {
  it('devuelve el paquete del ítem cuyo `to` es prefijo de la ruta', () => {
    expect(moduleForPath('/pagos')).toBe('staff_payments');
    expect(moduleForPath('/personal/123')).toBe('staff_payments');
    expect(moduleForPath('/configuracion/operadores-aereos')).toBe('air_accounts');
    expect(moduleForPath('/agenda')).toBe('agenda');
  });

  it('las rutas de Base no tienen paquete', () => {
    expect(moduleForPath('/egresos')).toBeUndefined();
    expect(moduleForPath('/configuracion/usuarios')).toBeUndefined();
    expect(moduleForPath('/perfil')).toBeUndefined();
  });
});

describe('appRedirect (F21 CA-12)', () => {
  const user = { modules: ['credentials'] } as unknown as AuthProfile;
  const signedIn = { status: 'authenticated', accessToken: 't', user } as const;
  const at = (href: string) => ({ href, pathname: href.split('?')[0]! });

  it('sin sesión lleva al login con la ruta pedida', () => {
    const anonymous = { status: 'anonymous', accessToken: null, user: null } as const;
    expect(appRedirect(anonymous, at('/agenda?x=1'))).toEqual({
      to: '/login',
      search: { redirect: '/agenda?x=1' },
    });
  });

  it('con el paquete de la ruta apagado lleva a Egresos', () => {
    expect(appRedirect(signedIn, at('/agenda'))).toEqual({ to: '/egresos' });
  });

  it('con acceso no redirige', () => {
    expect(appRedirect(signedIn, at('/credenciales'))).toBeNull();
    expect(appRedirect(signedIn, at('/egresos'))).toBeNull();
  });
});
