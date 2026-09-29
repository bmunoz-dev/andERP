import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/components/page-header';

export const Route = createFileRoute('/_app/credenciales')({
  component: () => <ComingSoon title="Credenciales" feature="F06" />,
});
