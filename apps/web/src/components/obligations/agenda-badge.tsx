import { useQuery } from '@tanstack/react-query';
import { SidebarMenuBadge } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { countAlerts, listObligations, obligationKeys } from '@/lib/obligations-api';

/**
 * Contador del ítem "Agenda" en el menú (F13 CA-16): vencidas + próximas. Rojo si hay alguna
 * vencida, ámbar si solo hay próximas; nada si no hay alertas.
 */
export function AgendaBadge() {
  const { data } = useQuery({ queryKey: obligationKeys.list, queryFn: listObligations });
  const { overdue, upcoming } = countAlerts(data);
  if (overdue + upcoming === 0) return null;
  const tone = overdue > 0 ? 'overdue' : 'upcoming';
  return (
    <SidebarMenuBadge
      data-testid="agenda-badge"
      data-tone={tone}
      aria-label={`${String(overdue)} vencidas y ${String(upcoming)} próximas`}
      className={cn(
        'text-white peer-hover/menu-button:text-white peer-data-[active=true]/menu-button:text-white',
        tone === 'overdue' ? 'bg-destructive' : 'bg-amber-500',
      )}
    >
      {overdue + upcoming}
    </SidebarMenuBadge>
  );
}
