import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppSidebar } from '@/components/app-sidebar';
import { OrganizationSwitcher } from '@/components/organization-switcher';
import { NotificationsBell } from '@/components/notifications/notifications-bell';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { UserMenu } from '@/components/user-menu';
import { authStore, useAuth } from '@/lib/auth-store';
import { moduleForPath } from '@/lib/navigation';

/**
 * Layout de las rutas privadas (F01 CA-20, F02 CA-18): sin sesión, redirige al login. Una ruta
 * de un paquete que la organización no tiene redirige a Egresos (F19 CA-17).
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ location }) => {
    const auth = authStore.get();
    if (auth.status !== 'authenticated') {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
    const module = moduleForPath(location.pathname);
    if (module && !auth.user.modules.includes(module)) throw redirect({ to: '/egresos' });
  },
  component: AppLayout,
});

function AppLayout() {
  const auth = useAuth();
  if (auth.status !== 'authenticated') return null;

  return (
    <SidebarProvider>
      <AppSidebar user={auth.user} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <SidebarTrigger aria-label="Mostrar u ocultar el menú" />
          <OrganizationSwitcher user={auth.user} />
          <div className="ml-auto flex items-center gap-1">
            <NotificationsBell />
            <UserMenu user={auth.user} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
