import type { NotificationItem } from '@anderp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Bell, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate } from '@/lib/format';
import {
  dismissNotification,
  getNotifications,
  markNotificationsSeen,
  notificationKeys,
} from '@/lib/notifications-api';
import { dueText, STATUS_CLASSES, STATUS_LABELS } from '@/lib/obligations-api';

const keyOf = (n: NotificationItem) => `${n.dueDateId}:${n.kind}`;
const statusOf = (n: NotificationItem) =>
  n.kind === 'obligation_overdue' ? 'overdue' : 'upcoming';

/**
 * Campana de la cabecera (F14 CA-12–CA-17): un punto si hay algo sin revisar; el panel lista las
 * alertas de la Agenda. Abrirlo las marca como vistas; las que eran nuevas se señalan mientras
 * sigue abierto.
 */
export function NotificationsBell() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const { data } = useQuery({ queryKey: notificationKeys.all, queryFn: getNotifications });
  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  const markSeen = useMutation({ mutationFn: markNotificationsSeen, onSuccess: refresh });
  const dismiss = useMutation({ mutationFn: dismissNotification, onSuccess: refresh });
  const items = data?.items ?? [];

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setFresh(new Set(items.filter((n) => !n.seen).map(keyOf)));
    if (data?.unseen) markSeen.mutate();
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={data?.unseen ? 'Notificaciones sin revisar' : 'Notificaciones'}
        >
          <Bell />
          {data?.unseen && (
            <span
              data-testid="notifications-dot"
              className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="border-b px-4 py-2 text-sm font-medium">Notificaciones</div>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No tienes notificaciones.
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <li key={keyOf(n)} className="flex items-start border-b last:border-0">
                <button
                  type="button"
                  className="flex-1 px-4 py-3 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    setOpen(false);
                    void navigate({ to: '/agenda', search: { status: statusOf(n) } });
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Badge className={STATUS_CLASSES[statusOf(n)]}>
                      {STATUS_LABELS[statusOf(n)]}
                    </Badge>
                    {fresh.has(keyOf(n)) && (
                      <span className="text-xs font-medium text-primary">Nueva</span>
                    )}
                  </div>
                  <div className="mt-1 font-medium">
                    {n.entityName} · {n.concept}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Vence {formatDate(n.dueDate)} · {dueText(n.daysLeft)}
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-2 mr-2"
                  aria-label="Descartar"
                  onClick={() => {
                    dismiss.mutate({ dueDateId: n.dueDateId, kind: n.kind });
                  }}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
