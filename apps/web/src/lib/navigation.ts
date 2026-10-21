import type { AppModule } from '@anderp/shared';
import {
  Building,
  Building2,
  CalendarClock,
  FileText,
  HandCoins,
  KeyRound,
  Library,
  type LucideIcon,
  Plane,
  Receipt,
  Tags,
  UserRound,
  Users,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Paquete que la organización debe tener (F19); sin él, el ítem es de Base. */
  module?: AppModule;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const operation: NavGroup = {
  label: 'Operación',
  items: [
    { label: 'Egresos', to: '/egresos', icon: Receipt },
    { label: 'Pagos', to: '/pagos', icon: HandCoins, module: 'staff_payments' },
    { label: 'Personal', to: '/personal', icon: FileText, module: 'staff_payments' },
    { label: 'Credenciales', to: '/credenciales', icon: KeyRound, module: 'credentials' },
    { label: 'Responsables', to: '/responsables', icon: UserRound, module: 'credentials' },
    { label: 'Cuentas aéreas', to: '/cuentas-aereas', icon: Plane, module: 'air_accounts' },
    { label: 'Agenda', to: '/agenda', icon: CalendarClock, module: 'agenda' },
  ],
};

const settings: NavGroup = {
  label: 'Configuración',
  items: [
    // En la interfaz las categorías de egreso se llaman "Departamentos" (design.md §3).
    { label: 'Departamentos', to: '/configuracion/categorias', icon: Tags },
    {
      label: 'Operadores aéreos',
      to: '/configuracion/operadores-aereos',
      icon: Building,
      module: 'air_accounts',
    },
    { label: 'Usuarios', to: '/configuracion/usuarios', icon: Users },
  ],
};

const platform: NavGroup = {
  label: 'Plataforma',
  items: [
    { label: 'Organizaciones', to: '/plataforma/organizaciones', icon: Building2 },
    { label: 'Catálogos', to: '/plataforma/catalogos', icon: Library },
  ],
};

/**
 * Menú lateral según el rol (F02 CA-18) y los paquetes de la organización (F19 CA-16):
 * "Plataforma" solo para el super admin; sin el paquete, el ítem no aparece.
 */
export function navigationFor(user: { isSuperAdmin: boolean; modules: AppModule[] }): NavGroup[] {
  const groups = user.isSuperAdmin ? [operation, settings, platform] : [operation, settings];
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !i.module || user.modules.includes(i.module)),
    }))
    .filter((g) => g.items.length > 0);
}

/** Paquete de la ruta, con la misma regla de prefijo que `isActive` en `app-sidebar.tsx` (F19 CA-17). */
export function moduleForPath(pathname: string): AppModule | undefined {
  return [operation, settings].flatMap((g) => g.items).find((i) => pathname.startsWith(i.to))
    ?.module;
}
