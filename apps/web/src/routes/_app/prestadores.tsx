import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/components/page-header';

export const Route = createFileRoute('/_app/prestadores')({
  component: () => <ComingSoon title="Prestadores de servicios" feature="F03" />,
});
