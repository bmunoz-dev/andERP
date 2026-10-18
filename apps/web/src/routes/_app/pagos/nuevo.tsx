import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FeePaymentForm } from '@/components/fee-payments/fee-payment-form';
import { PageHeader } from '@/components/page-header';

export const Route = createFileRoute('/_app/pagos/nuevo')({
  component: NewFeePaymentPage,
});

function NewFeePaymentPage() {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Nuevo pago por días"
        description="Elige la semana, la persona y el valor de cada día trabajado."
      />
      <FeePaymentForm onSaved={() => navigate({ to: '/pagos' })} />
    </>
  );
}
