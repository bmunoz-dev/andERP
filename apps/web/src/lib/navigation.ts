import {
  Building2,
  FileText,
  HandCoins,
  Home,
  KeyRound,
  Library,
  type LucideIcon,
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
    { label: 'Inicio', to: '/', icon: Home },
    { label: 'Egresos', to: '/egresos', icon: Receipt },
    { label: 'Honorarios', to: '/honorarios', icon: HandCoins },
    { label: 'Prestadores', to: '/prestadores', icon: FileText },
    { label: 'Credenciales', to: '/credenciales', icon: KeyRound },
    { label: 'Responsables', to: '/responsables', icon: UserRound },
  ],
};

const settings: NavGroup = {
  label: 'Configuración',
  items: [
    // En la interfaz las categorías de egreso se llaman "Departamentos" (design.md §3).
    { label: 'Departamentos', to: '/configuracion/categorias', icon: Tags },
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
