import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FeePaymentForm } from '@/components/fee-payments/fee-payment-form';
import { PageHeader } from '@/components/page-header';
import { errorMessage } from '@/lib/error-messages.es';
import { feePaymentKeys, getFeePayment } from '@/lib/fee-payments-api';

export const Route = createFileRoute('/_app/honorarios/$id')({
  component: EditFeePaymentPage,
});

function EditFeePaymentPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const payment = useQuery({
    queryKey: feePaymentKeys.detail(id),
    queryFn: () => getFeePayment(id),
  });

  return (
    <>
      <PageHeader
        title="Editar pago de honorarios"
        {...(payment.data ? { description: payment.data.serviceProvider.name } : {})}
      />
      {payment.isError && <p className="text-muted-foreground">{errorMessage(payment.error)}</p>}
      {payment.data && (
        <FeePaymentForm payment={payment.data} onSaved={() => navigate({ to: '/honorarios' })} />
      )}
    </>
  );
}
