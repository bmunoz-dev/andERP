import type {
  CatalogItem,
  CatalogKind,
  CreateCatalogItem,
  CreateExpenseCategory,
  CreateOrganization,
  ExpenseCategory,
  InviteMember,
  Member,
  Organization,
  UpdateCatalogItem,
  UpdateExpenseCategory,
  UpdateOrganization,
} from '@anderp/shared';
import { apiFetch } from './api-client';

/** Llaves de TanStack Query: una sola fuente para leer e invalidar. */
export const queryKeys = {
  catalog: (kind: CatalogKind, includeInactive: boolean) =>
    ['catalogs', kind, { includeInactive }] as const,
  catalogs: ['catalogs'] as const,
  expenseCategories: ['expense-categories'] as const,
  members: ['members'] as const,
  organizations: ['platform', 'organizations'] as const,
};

// ── Catálogos globales ────────────────────────────────────────────────────────────────────

export const listCatalog = (kind: CatalogKind, includeInactive = false) =>
  apiFetch<CatalogItem[]>(`/catalogs/${kind}${includeInactive ? '?includeInactive=true' : ''}`);

export const createCatalogItem = (kind: CatalogKind, body: CreateCatalogItem) =>
  apiFetch<CatalogItem>(`/platform/catalogs/${kind}`, { method: 'POST', json: body });

export const updateCatalogItem = (kind: CatalogKind, id: string, body: UpdateCatalogItem) =>
  apiFetch<CatalogItem>(`/platform/catalogs/${kind}/${id}`, { method: 'PATCH', json: body });

// ── Categorías de egreso ──────────────────────────────────────────────────────────────────

export const listExpenseCategories = () => apiFetch<ExpenseCategory[]>('/expense-categories');

export const createExpenseCategory = (body: CreateExpenseCategory) =>
  apiFetch<ExpenseCategory>('/expense-categories', { method: 'POST', json: body });

export const updateExpenseCategory = (id: string, body: UpdateExpenseCategory) =>
  apiFetch<ExpenseCategory>(`/expense-categories/${id}`, { method: 'PATCH', json: body });

export const deleteExpenseCategory = (id: string) =>
  apiFetch<undefined>(`/expense-categories/${id}`, { method: 'DELETE' });

export const reorderExpenseCategories = (ids: string[]) =>
  apiFetch<ExpenseCategory[]>('/expense-categories/order', { method: 'PUT', json: { ids } });

// ── Usuarios de la organización ───────────────────────────────────────────────────────────

export const listMembers = () => apiFetch<Member[]>('/members');

export const inviteMember = (body: InviteMember) =>
  apiFetch<Member>('/members', { method: 'POST', json: body });

export const setMemberActive = (userId: string, isActive: boolean) =>
  apiFetch<Member>(`/members/${userId}`, { method: 'PATCH', json: { isActive } });

export const resendInvite = (userId: string) =>
  apiFetch<undefined>(`/members/${userId}/resend-invite`, { method: 'POST' });

// ── Organizaciones (plataforma) ───────────────────────────────────────────────────────────

export const listOrganizations = () => apiFetch<Organization[]>('/platform/organizations');

export const createOrganization = (body: CreateOrganization) =>
  apiFetch<Organization>('/platform/organizations', { method: 'POST', json: body });

export const updateOrganization = (id: string, body: UpdateOrganization) =>
  apiFetch<Organization>(`/platform/organizations/${id}`, { method: 'PATCH', json: body });
