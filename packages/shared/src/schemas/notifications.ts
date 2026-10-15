import { z } from 'zod';

/** Tipo de notificación: el estado del vencimiento que la origina (F14 CA-1). */
export const notificationKindSchema = z.enum(['obligation_upcoming', 'obligation_overdue']);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

/** Una notificación activa: un vencimiento Próximo o Vencido de la Agenda (CA-7). */
export const notificationSchema = z.object({
  dueDateId: z.uuid(),
  kind: notificationKindSchema,
  obligationId: z.uuid(),
  entityName: z.string(),
  concept: z.string(),
  dueDate: z.string(),
  daysLeft: z.number(),
  seen: z.boolean(),
});
export type NotificationItem = z.infer<typeof notificationSchema>;

/** `unseen` enciende el punto de la campana (CA-7, CA-12). */
export const notificationsSchema = z.object({
  unseen: z.boolean(),
  items: z.array(notificationSchema),
});
export type Notifications = z.infer<typeof notificationsSchema>;

/** Una notificación se identifica por su vencimiento y su tipo (CA-9). */
export const dismissNotificationSchema = z.object({
  dueDateId: z.uuid(),
  kind: notificationKindSchema,
});
export type DismissNotification = z.infer<typeof dismissNotificationSchema>;
