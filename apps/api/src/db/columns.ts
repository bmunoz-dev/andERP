import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

/** Clave primaria UUIDv7, generada en el backend (ordenable por tiempo). */
export const id = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7());

const timestamptz = () => timestamp({ withTimezone: true, mode: 'date' });

/** Columnas de auditoría y borrado lógico de design.md §5.1. */
export const auditColumns = {
  createdAt: timestamptz().notNull().defaultNow(),
  createdBy: uuid(),
  updatedAt: timestamptz().notNull().defaultNow(),
  updatedBy: uuid(),
  deletedAt: timestamptz(),
  deletedBy: uuid(),
};

/** Columna obligatoria de las tablas de una organización (constitución, principio IV). */
export const organizationId = () => uuid().notNull();

/**
 * Texto que no distingue mayúsculas. Se califica con el esquema `extensions` para que las
 * migraciones no dependan del `search_path` del rol que las ejecuta.
 */
export const citext = customType<{ data: string }>({
  // drizzle-kit cita el nombre del tipo completo; así el SQL resultante es "extensions"."citext".
  dataType: () => 'extensions"."citext',
});
