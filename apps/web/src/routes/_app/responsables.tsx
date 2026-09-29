import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/components/page-header';

export const Route = createFileRoute('/_app/responsables')({
  component: () => <ComingSoon title="Responsables" feature="F06" />,
});
