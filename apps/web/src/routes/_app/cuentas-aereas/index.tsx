import type { AirAccount } from '@anderp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AccountFormDialog } from '@/components/air-accounts/account-form-dialog';
import { AccountsTable } from '@/components/air-accounts/accounts-table';
import { OperatorBalanceCards } from '@/components/air-accounts/operator-balance-cards';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  airKeys,
  listAirAccounts,
  listAirOperatorBalances,
  listAirOperators,
  updateAirAccount,
} from '@/lib/air-accounts-api';
import { errorMessage } from '@/lib/error-messages.es';

export const Route = createFileRoute('/_app/cuentas-aereas/')({
  component: AirAccountsPage,
});

/** Cuentas con los operadores aéreos y su consolidado por operador (F18 CA-28). */
function AirAccountsPage() {
  const queryClient = useQueryClient();
  const accounts = useQuery({ queryKey: airKeys.accounts, queryFn: listAirAccounts });
  const balances = useQuery({ queryKey: airKeys.byOperator, queryFn: listAirOperatorBalances });
  const operators = useQuery({ queryKey: airKeys.operators, queryFn: listAirOperators });
  const [editing, setEditing] = useState<AirAccount | 'new' | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: airKeys.all });

  const toggle = useMutation({
    mutationFn: (a: AirAccount) => updateAirAccount(a.id, { isActive: !a.isActive }),
    onSuccess: (a) => {
      toast.success(a.isActive ? `"${a.name}" está activa` : `"${a.name}" quedó inactiva`);
      return refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <PageHeader
        title="Cuentas aéreas"
        description="Saldo y cupo de cada cuenta con los operadores. Una cuenta con límite 0 es prepago."
        actions={
          <Button
            onClick={() => {
              setEditing('new');
            }}
          >
            <Plus />
            Nueva cuenta
          </Button>
        }
      />
      <OperatorBalanceCards data={balances.data} />
      <AccountsTable
        data={accounts.data}
        isLoading={accounts.isPending}
        onEdit={setEditing}
        onToggle={(a) => {
          toggle.mutate(a);
        }}
      />
      {editing && (
        <AccountFormDialog
          account={editing === 'new' ? null : editing}
          operators={operators.data ?? []}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={refresh}
        />
      )}
    </>
  );
}
