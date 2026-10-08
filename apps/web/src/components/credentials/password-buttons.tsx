import { Copy, Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { revealCredential } from '@/lib/credentials-api';
import { errorMessage } from '@/lib/error-messages.es';

/** Muestra la contraseña 30 segundos (F06 CA-14). Cada vez llama a reveal, que queda auditado. */
export function RevealButton({
  credentialId,
  visibleMs = 30_000,
}: {
  credentialId: string;
  visibleMs?: number;
}) {
  const [password, setPassword] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (password === null) return;
    const timer = setTimeout(() => {
      setPassword(null);
    }, visibleMs);
    return () => {
      clearTimeout(timer);
    };
  }, [password, visibleMs]);

  if (password !== null) {
    return (
      <span className="inline-flex items-center gap-1">
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{password}</code>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setPassword(null);
          }}
        >
          <EyeOff />
          Ocultar
        </Button>
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        revealCredential(credentialId)
          .then((r) => {
            setPassword(r.password);
          })
          .catch((e: unknown) => toast.error(errorMessage(e)))
          .finally(() => {
            setLoading(false);
          });
      }}
    >
      <Eye />
      Revelar
    </Button>
  );
}

/** Copia la contraseña al portapapeles sin mostrarla (F06 CA-14). */
export function CopyButton({ credentialId }: { credentialId: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        revealCredential(credentialId)
          .then((r) => navigator.clipboard.writeText(r.password))
          .then(() => toast.success('Contraseña copiada'))
          .catch((e: unknown) => toast.error(errorMessage(e)));
      }}
    >
      <Copy />
      Copiar
    </Button>
  );
}
