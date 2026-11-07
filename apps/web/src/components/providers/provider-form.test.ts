import { describe, expect, it } from 'vitest';
import { providerForm } from './provider-form';

describe('formulario de prestador (F24 CA-4)', () => {
  const base = {
    name: 'Ana Pérez',
    documentTypeId: 'cc',
    documentNumber: '1020304050',
    description: '',
    bankId: '',
    accountTypeId: '',
    accountNumber: '',
  };

  it('acepta la cuenta completa o vacía', () => {
    expect(providerForm.safeParse(base).success).toBe(true);
    expect(
      providerForm.safeParse({ ...base, bankId: 'b', accountTypeId: 't', accountNumber: '1234-56' })
        .success,
    ).toBe(true);
  });

  it('con la cuenta a medias marca los campos que faltan', () => {
    const result = providerForm.safeParse({ ...base, bankId: 'b' });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['accountTypeId', 'accountNumber']));
    expect(paths).not.toContain('bankId');
  });

  it('rechaza un número de cuenta con letras', () => {
    const result = providerForm.safeParse({
      ...base,
      bankId: 'b',
      accountTypeId: 't',
      accountNumber: '12ab',
    });
    expect(result.error?.issues.map((i) => i.path[0])).toContain('accountNumber');
  });
});
