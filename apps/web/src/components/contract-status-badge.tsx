import type { ContractStatus } from '@anderp/shared';
import { Badge } from '@/components/ui/badge';

const LABELS: Record<ContractStatus, string> = {
  upcoming: 'Próximo',
  active: 'Vigente',
  ended: 'Terminado',
};

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const variant = status === 'active' ? 'default' : status === 'upcoming' ? 'secondary' : 'outline';
  return <Badge variant={variant}>{LABELS[status]}</Badge>;
}
