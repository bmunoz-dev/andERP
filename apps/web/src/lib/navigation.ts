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
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const operation: NavGroup = {
  label: 'Operación',
  items: [
    { label: 'Egresos', to: '/egresos', icon: Receipt },
    { label: 'Pagos', to: '/pagos', icon: HandCoins },
    { label: 'Personal', to: '/personal', icon: FileText },
    { label: 'Credenciales', to: '/credenciales', icon: KeyRound },
    { label: 'Responsables', to: '/responsables', icon: UserRound },
    { label: 'Cuentas aéreas', to: '/cuentas-aereas', icon: Plane },
    { label: 'Agenda', to: '/agenda', icon: CalendarClock },
  ],
};

const settings: NavGroup = {
  label: 'Configuración',
  items: [
    // En la interfaz las categorías de egreso se llaman "Departamentos" (design.md §3).
    { label: 'Departamentos', to: '/configuracion/categorias', icon: Tags },
    { label: 'Operadores aéreos', to: '/configuracion/operadores-aereos', icon: Building },
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

/** Menú lateral según el rol (F02 CA-18): "Plataforma" solo para el super admin. */
export function navigationFor(user: { isSuperAdmin: boolean }): NavGroup[] {
  return user.isSuperAdmin ? [operation, settings, platform] : [operation, settings];
}
