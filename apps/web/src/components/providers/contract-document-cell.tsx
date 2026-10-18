import {
  CONTRACT_DOCUMENT_MAX_BYTES,
  CONTRACT_DOCUMENT_TYPES,
  type Contract,
} from '@anderp/shared';
import { useMutation } from '@tanstack/react-query';
import { Download, ExternalLink, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-messages.es';
import {
  contractDocumentUrl,
  deleteContractDocument,
  uploadContractDocument,
} from '@/lib/providers-api';

const ACCEPT = Object.keys(CONTRACT_DOCUMENT_TYPES).join(',');

/** CA-18: el mismo límite que aplica la API, para avisar (con un toast) sin subir nada. */
function precheck(file: File): string | null {
  const dot = file.name.lastIndexOf('.');
  const extension = dot === -1 ? '' : file.name.slice(dot).toLowerCase();
  if (!(extension in CONTRACT_DOCUMENT_TYPES))
    return 'Solo se admiten archivos PDF o Word (.doc, .docx).';
  if (file.size > CONTRACT_DOCUMENT_MAX_BYTES) return 'El archivo supera los 10 MB.';
  return null;
}

/** F17: documento del contrato en la tabla de la ficha de la persona (CA-17 a CA-19b). */
export function ContractDocumentCell({
  contract,
  onChanged,
}: {
  contract: Contract;
  onChanged: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<'replace' | 'delete' | null>(null);
  const document = contract.document;

  const upload = useMutation({
    mutationFn: (file: File) => uploadContractDocument(contract.id, file),
    onSuccess: async () => {
      toast.success(document ? 'Documento reemplazado' : 'Documento subido');
      await onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => deleteContractDocument(contract.id),
    onSuccess: async () => {
      toast.success('Documento eliminado');
      await onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  /** CA-19: la pestaña se abre en el clic (sin bloqueador) y sin acceso a esta página. */
  async function open() {
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const { url } = await contractDocumentUrl(contract.id);
      if (tab) tab.location.href = url;
    } catch (e) {
      tab?.close();
      toast.error(errorMessage(e));
    }
  }

  /**
   * CA-19b: el Word se firma como `attachment`, así que seguir el enlace lo descarga sin salir de
   * la ficha. No es un iframe: la CSP de la web (`default-src 'self'`) lo bloquearía.
   */
  async function download() {
    try {
      const { url } = await contractDocumentUrl(contract.id);
      const link = window.document.createElement('a');
      link.href = url;
      link.click();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="grid gap-1">
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        data-testid="contract-document-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const problem = precheck(file);
          // Como los errores de la API: un toast, sin dejar texto en la tabla.
          if (problem) toast.error(problem);
          else upload.mutate(file);
        }}
      />
      {document ? (
        <>
          <span className="max-w-48 truncate text-sm" title={document.fileName}>
            {document.fileName}
          </span>
          <div className="flex flex-wrap gap-1">
            {document.contentType === 'application/pdf' ? (
              <Button variant="ghost" size="sm" onClick={() => void open()}>
                <ExternalLink />
                Abrir
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => void download()}>
                <Download />
                Descargar
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={upload.isPending}
              onClick={() => {
                setConfirm('replace');
              }}
            >
              <RefreshCw />
              Reemplazar
            </Button>
            <Button
              variant="destructive-ghost"
              size="sm"
              disabled={remove.isPending}
              onClick={() => {
                setConfirm('delete');
              }}
            >
              <Trash2 />
              Eliminar
            </Button>
          </div>
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={upload.isPending}
          onClick={() => input.current?.click()}
        >
          <Upload />
          Subir
        </Button>
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConfirm(null);
        }}
        title={confirm === 'delete' ? '¿Eliminar el documento?' : '¿Reemplazar el documento?'}
        description={
          confirm === 'delete'
            ? 'El contrato queda sin documento. El archivo se conserva en el almacenamiento y la acción queda auditada.'
            : 'El archivo nuevo reemplaza al actual. El anterior se conserva en el almacenamiento y la acción queda auditada.'
        }
        confirmLabel={confirm === 'delete' ? 'Eliminar documento' : 'Elegir archivo'}
        destructive={confirm === 'delete'}
        onConfirm={() => {
          if (confirm === 'delete') remove.mutate();
          // El clic de confirmar es la interacción del usuario que permite abrir el selector.
          else input.current?.click();
          setConfirm(null);
        }}
      />
    </div>
  );
}
