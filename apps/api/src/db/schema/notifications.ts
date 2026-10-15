import { foreignKey, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { id, organizationId } from '../columns';
import { organizations, users } from './core';
import { anderp } from './enums';
import { obligationDueDates } from './obligations';

export const notificationKind = anderp.enum('notification_kind', [
  'obligation_upcoming',
  'obligation_overdue',
]);

/**
 * Lo que cada usuario hizo con una notificación (F14, design.md §5.12): verla y descartarla. Las
 * notificaciones no se guardan; se calculan de la Agenda. Sin columnas de auditoría ni borrado
 * lógico: el autor es siempre `user_id` y descartar no es borrar.
 */
export const notificationStates = anderp.table(
  'notification_states',
  {
    id: id(),
    organizationId: organizationId().references(() => organizations.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    dueDateId: uuid().notNull(),
    kind: notificationKind().notNull(),
    seenAt: timestamp({ withTimezone: true, mode: 'date' }),
    dismissedAt: timestamp({ withTimezone: true, mode: 'date' }),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    unique('notification_states_org_id_uq').on(t.organizationId, t.id),
    unique('notification_states_key_uq').on(t.userId, t.dueDateId, t.kind),
    foreignKey({
      name: 'notification_states_due_date_fk',
      columns: [t.organizationId, t.dueDateId],
      foreignColumns: [obligationDueDates.organizationId, obligationDueDates.id],
    }),
  ],
);
