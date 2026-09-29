import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '@/components/page-header';

export const Route = createFileRoute('/_app/egresos')({
  component: () => <ComingSoon title="Egresos" feature="F05" />,
});
