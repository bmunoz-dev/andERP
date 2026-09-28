import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Todas las tablas, vistas y funciones de AndERP viven en el esquema `anderp`, nunca en
 * `public`: Supabase expone `public` por su Data API (design.md §5.1, F07).
 */
export const anderp = pgSchema('anderp');

// Enums de design.md §5.2.
export const organizationStatus = anderp.enum('organization_status', ['active', 'suspended']);
export const userStatus = anderp.enum('user_status', ['active', 'locked', 'inactive']);
export const memberRole = anderp.enum('member_role', ['admin']);
export const paymentFrequency = anderp.enum('payment_frequency', [
  'weekly',
  'biweekly',
  'monthly',
  'bimonthly',
]);
