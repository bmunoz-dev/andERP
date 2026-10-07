import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FeePaymentForm } from '@/components/fee-payments/fee-payment-form';
import { PageHeader } from '@/components/page-header';

export const Route = createFileRoute('/_app/honorarios/nuevo')({
  component: NewFeePaymentPage,
});

function NewFeePaymentPage() {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title="Nuevo pago de honorarios"
        description="Elige la semana, el prestador y el valor de cada día trabajado."
      />
      <FeePaymentForm onSaved={() => navigate({ to: '/honorarios' })} />
    </>
  );
}
