import { describe, expect, it } from 'vitest';
import { isoDateSchema, nonNegativeMoneySchema, positiveMoneySchema } from './common';

describe('isoDateSchema', () => {
  it.each(['2026-09-28', '2028-02-29'])('acepta %s', (value) => {
    expect(isoDateSchema.safeParse(value).success).toBe(true);
  });
  it.each(['2026-02-30', '28/09/2026', '2026-9-28', ''])('rechaza %j', (value) => {
    expect(isoDateSchema.safeParse(value).success).toBe(false);
  });
});

describe('positiveMoneySchema', () => {
  it.each(['0.01', '4500000.00'])('acepta %s', (value) => {
    expect(positiveMoneySchema.safeParse(value).success).toBe(true);
  });
  it.each(['0.00', '-1.00', '1500', 1500])('rechaza %j', (value) => {
    expect(positiveMoneySchema.safeParse(value).success).toBe(false);
  });
});

describe('nonNegativeMoneySchema', () => {
  it('acepta cero y rechaza negativos', () => {
    expect(nonNegativeMoneySchema.safeParse('0.00').success).toBe(true);
    expect(nonNegativeMoneySchema.safeParse('-0.01').success).toBe(false);
  });
});
