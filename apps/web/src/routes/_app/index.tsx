import { createFileRoute, redirect } from '@tanstack/react-router';

// Egresos es la pantalla de inicio (F05-T016).
export const Route = createFileRoute('/_app/')({
  beforeLoad: () => {
    throw redirect({ to: '/egresos' });
  },
});
