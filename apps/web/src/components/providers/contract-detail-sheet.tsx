import {
  type Contract,
  formatCOP,
  PAYMENT_FREQUENCY_LABELS,
  PAYMENT_MODE_LABELS,
} from '@anderp/shared';
import { Pencil, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ContractStatusBadge } from '@/components/contract-status-badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatContractPeriod } from '@/lib/format';
import { ContractDocumentCell } from './contract-document-cell';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * F17 CA-17b: todo el contrato en un panel lateral, para que la tabla muestre solo lo esencial.
 * Recibe el contrato de la consulta de la ficha: al subir o eliminar el documento se actualiza.
 */
export function ContractDetailSheet({
  contract,
  onClose,
  onEdit,
  onDelete,
  onChanged,
}: {
  contract: Contract | null;
  onClose: () => void;
  onEdit: (contract: Contract) => void;
  onDelete: (contract: Contract) => void;
  onChanged: () => Promise<void>;
}) {
  return (
    <Sheet
      open={contract !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {contract && (
          <>
            <SheetHeader>
              <SheetTitle>Contrato</SheetTitle>
              <SheetDescription>{formatContractPeriod(contract)}</SheetDescription>
            </SheetHeader>
            <dl className="grid gap-4 px-4 sm:grid-cols-2">
              <Field label="Estado">
                <ContractStatusBadge status={contract.status} />
              </Field>
              <Field label="Forma de pago">{PAYMENT_MODE_LABELS[contract.paymentMode]}</Field>
              <Field label="Periodicidad">
                {PAYMENT_FREQUENCY_LABELS[contract.paymentFrequency]}
              </Field>
              <Field label="Monto mensual">
                <span className="tabular-nums">{formatCOP(contract.monthlyAmount)}</span>
              </Field>
              <Field label="Pagado este mes">
                <span className="tabular-nums">{formatCOP(contract.paidThisMonth)}</span>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Acuerdo de trabajo">
                  <p className="text-sm whitespace-pre-line">{contract.workAgreement}</p>
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Documento">
                  <ContractDocumentCell contract={contract} onChanged={onChanged} />
                </Field>
              </div>
            </dl>
            <SheetFooter className="flex-row justify-end gap-2">
              <Button
                variant="outline"
                aria-label="Editar contrato"
                onClick={() => {
                  onEdit(contract);
                }}
              >
                <Pencil />
                Editar
              </Button>
              <Button
                variant="destructive-ghost"
                aria-label="Eliminar contrato"
                onClick={() => {
                  onDelete(contract);
                }}
              >
                <Trash2 />
                Eliminar
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
