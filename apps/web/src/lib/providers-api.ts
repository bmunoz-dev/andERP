import type {
  Contract,
  CreateContract,
  CreateServiceProvider,
  ServiceProvider,
  UpdateContract,
  UpdateServiceProvider,
} from '@anderp/shared';
import { apiFetch } from './api-client';

export interface ProviderFilters {
  search: string;
  hasActiveContract: 'all' | 'yes' | 'no';
}

export const providerKeys = {
  all: ['service-providers'] as const,
  list: (filters: ProviderFilters) => ['service-providers', 'list', filters] as const,
  detail: (id: string) => ['service-providers', 'detail', id] as const,
  contracts: (id: string) => ['service-providers', 'contracts', id] as const,
};

export function listProviders(filters: ProviderFilters): Promise<ServiceProvider[]> {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.hasActiveContract !== 'all') {
    params.set('hasActiveContract', String(filters.hasActiveContract === 'yes'));
  }
  const query = params.toString();
  return apiFetch(`/service-providers${query ? `?${query}` : ''}`);
}

export const getProvider = (id: string) => apiFetch<ServiceProvider>(`/service-providers/${id}`);

export const createProvider = (body: CreateServiceProvider) =>
  apiFetch<ServiceProvider>('/service-providers', { method: 'POST', json: body });

export const updateProvider = (id: string, body: UpdateServiceProvider) =>
  apiFetch<ServiceProvider>(`/service-providers/${id}`, { method: 'PATCH', json: body });

export const deleteProvider = (id: string) =>
  apiFetch<undefined>(`/service-providers/${id}`, { method: 'DELETE' });

export const listContracts = (providerId: string) =>
  apiFetch<Contract[]>(`/service-providers/${providerId}/contracts`);

export const createContract = (providerId: string, body: CreateContract) =>
  apiFetch<Contract>(`/service-providers/${providerId}/contracts`, { method: 'POST', json: body });

export const updateContract = (id: string, body: UpdateContract) =>
  apiFetch<Contract>(`/contracts/${id}`, { method: 'PATCH', json: body });

export const deleteContract = (id: string) =>
  apiFetch<undefined>(`/contracts/${id}`, { method: 'DELETE' });
