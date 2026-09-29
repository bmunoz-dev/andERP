import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { UserMenu } from '@/components/user-menu';
import { authStore, useAuth } from '@/lib/auth-store';

/** Layout de las rutas privadas (F01 CA-20, F02 CA-18): sin sesión, redirige al login. */
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ location }) => {
    if (authStore.get().status !== 'authenticated') {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
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
          <span className="truncate text-sm text-muted-foreground">
            {auth.user.organization.name}
          </span>
          <div className="ml-auto">
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
