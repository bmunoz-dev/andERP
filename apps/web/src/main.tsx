import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiError, onSessionExpired, refreshSession } from './lib/api-client';
import { routeTree } from './routeTree.gen';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Los errores 4xx no se arreglan reintentando.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
        failureCount < 2,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Si la sesión ya no se puede renovar, se limpia la caché y se vuelve al login.
onSessionExpired(() => {
  queryClient.clear();
  void router.navigate({ to: '/login', search: { redirect: router.state.location.href } });
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Antes de pintar, se intenta recuperar la sesión con la cookie del refresh token (F01 CA-20).
void refreshSession().finally(() => {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
});
