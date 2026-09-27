import { z } from 'zod';

/**
 * Dinero como string decimal canónico con 2 decimales ("150000.00"), igual que `numeric(14,2)`.
 * Nunca se hace aritmética con `number` (constitución, principio V).
 */
export type Money = string;

export const MONEY_PATTERN = /^-?\d{1,12}\.\d{2}$/;

export const moneySchema = z.string().regex(MONEY_PATTERN, 'Invalid money amount');

export function isMoney(value: string): value is Money {
  return MONEY_PATTERN.test(value);
}

const THOUSANDS_GROUPED = /^\d{1,3}(\.\d{3})+$/;
const PLAIN_INTEGER = /^\d+$/;
const CANONICAL_DECIMAL = /^\d+\.\d{1,2}$/;

/**
 * Convierte lo que escribe un usuario en Colombia a `Money`.
 * Punto = miles y coma = decimales ("1.500.000,75"). También acepta el formato
 * canónico ("150000.50"). Devuelve `null` si la entrada es ambigua o inválida.
 */
export function toMoney(input: string): Money | null {
  let text = input.replace(/\s|\$|COP/gi, '');
  const negative = text.startsWith('-');
  if (negative) text = text.slice(1);

  let integerPart: string;
  let decimalPart = '';

  const commaParts = text.split(',');
  if (commaParts.length > 2) return null;
  if (commaParts.length === 2) {
    const [intText = '', decText = ''] = commaParts;
    if (!/^\d{1,2}$/.test(decText)) return null;
    if (!PLAIN_INTEGER.test(intText) && !THOUSANDS_GROUPED.test(intText)) return null;
    integerPart = intText.replaceAll('.', '');
    decimalPart = decText;
  } else if (PLAIN_INTEGER.test(text)) {
    integerPart = text;
  } else if (THOUSANDS_GROUPED.test(text)) {
    integerPart = text.replaceAll('.', '');
  } else if (CANONICAL_DECIMAL.test(text)) {
    [integerPart = '', decimalPart = ''] = text.split('.');
  } else {
    return null;
  }

  integerPart = integerPart.replace(/^0+(?=\d)/, '');
  const result = `${negative ? '-' : ''}${integerPart}.${decimalPart.padEnd(2, '0')}`;
  return isMoney(result) ? result : null;
}

const formatters = {
  whole: new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }),
  cents: new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
};

/** Formatea para mostrar ("$ 150.000", "$ 150.000,50"). Solo presentación, no aritmética. */
export function formatCOP(value: Money): string {
  if (!isMoney(value)) throw new RangeError(`Invalid money amount: ${JSON.stringify(value)}`);
  // 12 dígitos enteros + 2 decimales caben sin pérdida en un double (15 dígitos significativos).
  const formatter = value.endsWith('.00') ? formatters.whole : formatters.cents;
  return formatter.format(Number(value));
}
