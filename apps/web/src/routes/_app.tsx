import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router';
import { UserMenu } from '@/components/user-menu';
import { authStore, useAuth } from '@/lib/auth-store';

/** Layout de las rutas privadas (F01 CA-20): sin sesión, redirige al login. */
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
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            AndERP
          </Link>
          <span className="truncate text-sm text-muted-foreground">
            {auth.user.organization.name}
          </span>
          <div className="ml-auto">
            <UserMenu user={auth.user} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
