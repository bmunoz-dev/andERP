import { z } from 'zod';
import { isIsoDate } from '../dates/calendar-date';
import { moneySchema } from '../money';

/** Fecha de calendario `YYYY-MM-DD` válida (sin hora ni zona). */
export const isoDateSchema = z.string().refine(isIsoDate, 'Ingresa una fecha válida');

/** Valor en dinero mayor que cero. */
export const positiveMoneySchema = moneySchema.refine(
  (value) => !value.startsWith('-') && !/^0+\.00$/.test(value),
  'Debe ser mayor que cero',
);

/** Valor en dinero mayor o igual a cero. */
export const nonNegativeMoneySchema = moneySchema.refine(
  (value) => !value.startsWith('-'),
  'No puede ser negativo',
);
