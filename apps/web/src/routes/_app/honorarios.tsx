import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/components/page-header';

export const Route = createFileRoute('/_app/honorarios')({
  component: () => <ComingSoon title="Pagos de honorarios" feature="F04" />,
});
