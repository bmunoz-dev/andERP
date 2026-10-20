import type {
  AirAccount,
  AirMovement,
  AirMovementFilters,
  AirMovementSummary,
  AirMovementType,
  AirOperator,
  AirOperatorBalance,
  CreateAirMovement,
  SaveAirAccount,
  SaveAirOperator,
  UpdateAirAccount,
  UpdateAirMovement,
  UpdateAirOperator,
} from '@anderp/shared';
import { apiFetch } from './api-client';

/** Nombres en la interfaz de los tipos de movimiento (design.md §3). */
export const AIR_MOVEMENT_LABELS: Record<AirMovementType, string> = {
  opening_balance: 'Saldo inicial',
  recharge: 'Recarga',
  payment: 'Pago al operador',
  refund: 'Reembolso',
  issue: 'Emisión',
};

/** Prepago si el límite es 0, Crédito si es mayor (F18 CA-4): la modalidad no se guarda. */
export const isPrepaid = (account: Pick<AirAccount, 'creditLimit'>) =>
  /^0+\.00$/.test(account.creditLimit);

/** Todo cuelga de `air`: guardar cualquier cosa invalida saldos, consolidado y movimientos (F18). */
export const airKeys = {
  all: ['air'] as const,
  operators: ['air', 'operators'] as const,
  accounts: ['air', 'accounts'] as const,
  byOperator: ['air', 'by-operator'] as const,
  account: (id: string) => ['air', 'account', id] as const,
  movements: (accountId: string, f: AirMovementFilters) =>
    ['air', 'movements', accountId, f] as const,
  summary: (accountId: string, f: AirMovementFilters) => ['air', 'summary', accountId, f] as const,
};

export const listAirOperators = () => apiFetch<AirOperator[]>('/air-operators');

export const createAirOperator = (body: SaveAirOperator) =>
  apiFetch<AirOperator>('/air-operators', { method: 'POST', json: body });

export const updateAirOperator = (id: string, body: UpdateAirOperator) =>
  apiFetch<AirOperator>(`/air-operators/${id}`, { method: 'PATCH', json: body });

export const listAirAccounts = () => apiFetch<AirAccount[]>('/air-accounts');

export const listAirOperatorBalances = () =>
  apiFetch<AirOperatorBalance[]>('/air-accounts/by-operator');

export const getAirAccount = (id: string) => apiFetch<AirAccount>(`/air-accounts/${id}`);

export const createAirAccount = (body: SaveAirAccount) =>
  apiFetch<AirAccount>('/air-accounts', { method: 'POST', json: body });

export const updateAirAccount = (id: string, body: UpdateAirAccount) =>
  apiFetch<AirAccount>(`/air-accounts/${id}`, { method: 'PATCH', json: body });

const movementsPath = (accountId: string) => `/air-accounts/${accountId}/movements`;

const query = (f: AirMovementFilters) =>
  new URLSearchParams(Object.entries(f).filter((e): e is [string, string] => !!e[1])).toString();

export const listAirMovements = (accountId: string, f: AirMovementFilters) =>
  apiFetch<AirMovement[]>(`${movementsPath(accountId)}?${query(f)}`);

export const getAirMovementSummary = (accountId: string, f: AirMovementFilters) =>
  apiFetch<AirMovementSummary>(`${movementsPath(accountId)}/summary?${query(f)}`);

export const createAirMovement = (accountId: string, body: CreateAirMovement) =>
  apiFetch<AirMovement>(movementsPath(accountId), { method: 'POST', json: body });

export const updateAirMovement = (accountId: string, id: string, body: UpdateAirMovement) =>
  apiFetch<AirMovement>(`${movementsPath(accountId)}/${id}`, { method: 'PATCH', json: body });

export const deleteAirMovement = (accountId: string, id: string) =>
  apiFetch<undefined>(`${movementsPath(accountId)}/${id}`, { method: 'DELETE' });
