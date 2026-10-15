import type { DismissNotification, Notifications } from '@anderp/shared';
import { apiFetch } from './api-client';
import { obligationKeys } from './obligations-api';

// ponytail: la clave cuelga de la Agenda para que sus mutaciones (que invalidan `obligationKeys.all`)
// refresquen la campana (F14 CA-18). Se independiza si llega otra fuente de notificaciones.
export const notificationKeys = { all: [...obligationKeys.all, 'notifications'] as const };

export const getNotifications = () => apiFetch<Notifications>('/notifications');

export const markNotificationsSeen = () =>
  apiFetch<undefined>('/notifications/seen', { method: 'POST' });

export const dismissNotification = (body: DismissNotification) =>
  apiFetch<undefined>('/notifications/dismiss', { method: 'POST', json: body });
