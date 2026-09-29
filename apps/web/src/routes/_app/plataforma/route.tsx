import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { authStore } from '@/lib/auth-store';

/** Sección de plataforma (F02 CA-3): solo el super admin. La API también lo exige. */
export const Route = createFileRoute('/_app/plataforma')({
  beforeLoad: () => {
    const auth = authStore.get();
    if (auth.status !== 'authenticated' || !auth.user.isSuperAdmin) throw redirect({ to: '/' });
  },
  component: Outlet,
});
