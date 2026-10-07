import { describe, expect, it } from 'vitest';
import { formatCOP, isMoney, moneySchema, sumMoney, toMoney } from './money';

describe('isMoney', () => {
  it.each(['0.00', '150000.00', '-25.50', '999999999999.99'])('acepta %s', (value) => {
    expect(isMoney(value)).toBe(true);
  });

  it.each(['150000', '150000.5', '150.000,00', '1e5', '', ' 1.00', '1000000000000.00', '01.00x'])(
    'rechaza %j',
    (value) => {
      expect(isMoney(value)).toBe(false);
    },
  );
});

describe('toMoney (entrada del usuario en formato es-CO)', () => {
  it.each([
    ['150000', '150000.00'],
    ['150.000', '150000.00'],
    ['1.500.000', '1500000.00'],
    ['150000,5', '150000.50'],
    ['1.500.000,75', '1500000.75'],
    ['150000.50', '150000.50'],
    ['$ 150.000', '150000.00'],
    ['  2.500 ', '2500.00'],
    ['0', '0.00'],
    ['-1.000', '-1000.00'],
    ['007', '7.00'],
  ])('%j → %s', (input, expected) => {
    expect(toMoney(input)).toBe(expected);
  });

  it.each(['abc', '', '1,2,3', '1.50.000', '150000,123', '1..000', '9999999999999', '12a'])(
    '%j → null',
    (input) => {
      expect(toMoney(input)).toBeNull();
    },
  );
});

describe('formatCOP', () => {
  // Intl usa un espacio no separable entre el símbolo y el número; `\s` también lo reconoce.
  const normalize = (s: string) => s.replace(/\s/g, ' ');

  it.each([
    ['150000.00', '$ 150.000'],
    ['150000.50', '$ 150.000,50'],
    ['-1234567.89', '-$ 1.234.567,89'],
    ['0.00', '$ 0'],
  ])('%s → %s', (value, expected) => {
    expect(normalize(formatCOP(value))).toBe(expected);
  });
});

describe('moneySchema', () => {
  it('valida el formato canónico', () => {
    expect(moneySchema.safeParse('10.00').success).toBe(true);
    expect(moneySchema.safeParse('10').success).toBe(false);
    expect(moneySchema.safeParse(10).success).toBe(false);
  });
});

describe('sumMoney (centavos en BigInt, sin pérdida)', () => {
  it.each([
    [[], '0.00'],
    [['0.10', '0.20'], '0.30'],
    [['150000.00', '150000.50', '-0.50'], '300000.00'],
    [['999999999999.99', '0.01'], '1000000000000.00'],
  ])('%j → %s', (values, expected) => {
    expect(sumMoney(values)).toBe(expected);
  });
});
