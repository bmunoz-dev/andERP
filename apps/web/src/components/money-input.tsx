import { toMoney } from '@anderp/shared';
import { type ComponentProps, useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatMoneyPlain } from '@/lib/format';

interface MoneyInputProps extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> {
  /** Valor canónico (`"1500000.00"`) o `null` si está vacío o es inválido. */
  value: string | null;
  onChange: (value: string | null) => void;
}

/**
 * Campo de dinero en formato colombiano (F03-T010): se escribe "1.500.000" o "1500000,50" y
 * entrega el string decimal canónico que espera la API. Nunca convierte a `number`.
 */
export function MoneyInput({ value, onChange, onBlur, ...props }: MoneyInputProps) {
  const [text, setText] = useState(() => (value ? formatMoneyPlain(value) : ''));
  const [previousValue, setPreviousValue] = useState(value);

  // Si la prop cambia a algo distinto de lo escrito (p. ej. al reiniciar el formulario), se
  // muestra el valor nuevo. Si coincide con lo escrito, se respeta el texto del usuario.
  if (value !== previousValue) {
    setPreviousValue(value);
    if (value !== toMoney(text)) setText(value ? formatMoneyPlain(value) : '');
  }

  const parsed = text.trim() === '' ? null : toMoney(text);
  const invalid = text.trim() !== '' && parsed === null;

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      aria-invalid={invalid || props['aria-invalid'] ? true : undefined}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        onChange(next.trim() === '' ? null : toMoney(next));
      }}
      onBlur={(event) => {
        if (parsed) setText(formatMoneyPlain(parsed));
        onBlur?.(event);
      }}
    />
  );
}
