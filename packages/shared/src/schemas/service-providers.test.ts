import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_NUMBER_PATTERN,
  isBankAccountComplete,
  isContractEndValid,
} from './service-providers';

describe('reglas de prestadores y contratos (F24 CA-4)', () => {
  it('la cuenta bancaria va completa o vacía', () => {
    const full = { bankId: 'b', accountTypeId: 't', accountNumber: '1234' };
    expect(isBankAccountComplete(full)).toBe(true);
    expect(isBankAccountComplete({})).toBe(true);
    expect(isBankAccountComplete({ bankId: '', accountTypeId: null, accountNumber: '' })).toBe(
      true,
    );
    expect(isBankAccountComplete({ ...full, accountNumber: '' })).toBe(false);
    expect(isBankAccountComplete({ bankId: 'b' })).toBe(false);
  });

  it('el número de cuenta tiene de 4 a 30 números o guiones', () => {
    expect(ACCOUNT_NUMBER_PATTERN.test('1234-5678')).toBe(true);
    expect(ACCOUNT_NUMBER_PATTERN.test('123')).toBe(false);
    expect(ACCOUNT_NUMBER_PATTERN.test('12ab')).toBe(false);
  });

  it('el fin del contrato no es anterior al inicio', () => {
    expect(isContractEndValid('2026-01-01', null)).toBe(true);
    expect(isContractEndValid('2026-01-01', undefined)).toBe(true);
    expect(isContractEndValid('2026-01-01', '2026-01-01')).toBe(true);
    expect(isContractEndValid('2026-01-02', '2026-01-01')).toBe(false);
  });
});
