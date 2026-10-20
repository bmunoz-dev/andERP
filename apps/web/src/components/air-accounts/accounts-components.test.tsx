import type { AirAccount, AirOperatorBalance } from '@anderp/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountsTable } from './accounts-table';
import { OperatorBalanceCards } from './operator-balance-cards';

const account = (overrides: Partial<AirAccount>): AirAccount => ({
  id: crypto.randomUUID(),
  operatorId: crypto.randomUUID(),
  operatorName: 'Satena',
  name: 'KIU Bogotá',
  creditLimit: '0.00',
  isActive: true,
  balance: '0.00',
  available: '0.00',
  pendingCollection: '0.00',
  ...overrides,
});

describe('AccountsTable (F18 CA-28)', () => {
  it('muestra la modalidad según el límite y el saldo negativo en rojo', () => {
    render(
      <AccountsTable
        data={[
          account({ name: 'Prepago', balance: '3500000.00', available: '3500000.00' }),
          account({
            name: 'Crédito',
            creditLimit: '50000000.00',
            balance: '-12400000.00',
            available: '37600000.00',
          }),
        ]}
        isLoading={false}
        onEdit={vi.fn()}
        onToggle={vi.fn()}
      />,
    );
    const [prepaid, credit] = screen.getAllByRole('row').slice(1);
    expect(
      within(prepaid!).getByText('Prepago', { selector: '[data-slot="badge"]' }),
    ).toBeVisible();
    expect(within(credit!).getByText('Crédito', { selector: '[data-slot="badge"]' })).toBeVisible();
    expect(within(credit!).getByText(/12\.400\.000/)).toHaveClass('text-destructive');
  });

  it('una cuenta inactiva se marca y ofrece activarla', () => {
    const onToggle = vi.fn();
    const inactive = account({ isActive: false });
    render(
      <AccountsTable data={[inactive]} isLoading={false} onEdit={vi.fn()} onToggle={onToggle} />,
    );
    expect(screen.getByText('Inactiva')).toBeVisible();
    screen.getByRole('button', { name: 'Activar' }).click();
    expect(onToggle).toHaveBeenCalledWith(inactive);
  });
});

describe('OperatorBalanceCards (F18 CA-28)', () => {
  it('una tarjeta por operador con saldo, cupo, disponible y por cobrar', () => {
    const rows: AirOperatorBalance[] = [
      {
        operatorId: crypto.randomUUID(),
        operatorName: 'Satena',
        balance: '-12400000.00',
        creditLimit: '50000000.00',
        available: '37600000.00',
        pendingCollection: '850000.00',
      },
    ];
    render(<OperatorBalanceCards data={rows} />);
    const card = screen.getByRole('region', { name: 'Satena' });
    expect(card).toHaveTextContent(/Saldo\s*-\s*\$\s*12\.400\.000/);
    expect(card).toHaveTextContent(/Cupo\s*\$\s*50\.000\.000/);
    expect(card).toHaveTextContent(/Disponible\s*\$\s*37\.600\.000/);
    expect(card).toHaveTextContent(/Por cobrar\s*\$\s*850\.000/);
  });
});
