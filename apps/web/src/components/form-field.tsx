import { Eye, EyeOff } from 'lucide-react';
import { cn } from 'cn';
import { type ComponentProps, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FormFieldProps extends ComponentProps<typeof Input> {
  label: string;
  error?: string | undefined;
}

/**
 * Campo con etiqueta y mensaje de error accesibles (aria-invalid y aria-describedby).
 * Si es de contraseña, un botón la muestra u oculta (design.md §8).
 */
export function FormField({ label, error, id, type, className, ...inputProps }: FormFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';

  const input = (
    <Input
      id={fieldId}
      type={isPassword && visible ? 'text' : type}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      className={cn(isPassword && 'pr-10', className)}
      {...inputProps}
    />
  );

  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>{label}</Label>
      {isPassword ? (
        <div className="relative">
          {input}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground"
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onClick={() => {
              setVisible((v) => !v);
            }}
          >
            {visible ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      ) : (
        input
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
