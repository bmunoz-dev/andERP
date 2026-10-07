import { isMoney, parseIsoDate } from '@anderp/shared';

/**
 * `YYYY-MM-DD` → `dd/mm/aaaa`. Se arma con texto, no con `Date`: un `Date` en UTC puede
 * mostrarse como el día anterior en Bogotá.
 */
export function formatDate(date: string | null): string {
  if (!date) return '—';
  const { year, month, day } = parseIsoDate(date);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year)}`;
}

const plain = {
  whole: new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }),
  cents: new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

/** Dinero sin símbolo, para mostrar dentro de un campo de texto ("1.500.000", "2.500.000,50"). */
export function formatMoneyPlain(money: string): string {
  if (!isMoney(money)) return money;
  const formatter = money.endsWith('.00') ? plain.whole : plain.cents;
  // Solo presentación: 12 dígitos enteros + 2 decimales caben sin pérdida en un double.
  return formatter.format(Number(money));
}
