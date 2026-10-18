import type { Contract } from '@anderp/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  contractDocumentUrl,
  deleteContractDocument,
  uploadContractDocument,
} from '@/lib/providers-api';
import { ContractDocumentCell } from './contract-document-cell';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/providers-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/providers-api')>()),
  uploadContractDocument: vi.fn(),
  contractDocumentUrl: vi.fn(),
  deleteContractDocument: vi.fn(),
}));

const base: Contract = {
  id: '11111111-1111-4111-8111-111111111111',
  serviceProviderId: '22222222-2222-4222-8222-222222222222',
  startDate: '2026-01-01',
  endDate: null,
  workAgreement: 'Asistente',
  paymentFrequency: 'monthly',
  monthlyAmount: '2000000.00',
  paymentMode: 'daily',
  hasPayments: false,
  status: 'active',
  paidThisMonth: '0.00',
  document: null,
};
const withPdf: Contract = {
  ...base,
  document: {
    fileName: 'Contratación.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1000,
    uploadedAt: '2026-10-18T10:00:00Z',
  },
};
const withWord: Contract = {
  ...base,
  document: {
    fileName: 'contrato.docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: 1000,
    uploadedAt: '2026-10-18T10:00:00Z',
  },
};
const URL = { url: 'https://storage.example/firmada', expiresAt: '2026-10-18T10:05:00Z' };

function renderCell(contract: Contract) {
  const onChanged = vi.fn(() => Promise.resolve());
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ContractDocumentCell contract={contract} onChanged={onChanged} />
    </QueryClientProvider>,
  );
  return onChanged;
}

const choose = (file: File) => {
  fireEvent.change(screen.getByTestId('contract-document-input'), { target: { files: [file] } });
};

beforeEach(() => {
  vi.mocked(uploadContractDocument).mockResolvedValue(withPdf.document!);
  vi.mocked(contractDocumentUrl).mockResolvedValue(URL);
  vi.mocked(deleteContractDocument).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('ContractDocumentCell (F17)', () => {
  it('CA-17 y CA-18 sube un PDF; rechaza otro tipo o más de 10 MB sin llamar a la API', async () => {
    const onChanged = renderCell(base);
    expect(screen.getByRole('button', { name: 'Subir' })).toBeVisible();

    choose(new File(['x'], 'foto.png', { type: 'image/png' }));
    expect(toast.error).toHaveBeenLastCalledWith(expect.stringMatching(/PDF o Word/));
    choose(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.pdf'));
    expect(toast.error).toHaveBeenLastCalledWith(expect.stringMatching(/10 MB/));
    expect(uploadContractDocument).not.toHaveBeenCalled();

    const file = new File(['%PDF-1.7'], 'contrato.pdf', { type: 'application/pdf' });
    choose(file);
    await waitFor(() => {
      expect(uploadContractDocument).toHaveBeenCalledWith(base.id, file);
    });
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled();
    });
  });

  it('CA-19 "Abrir" abre la pestaña antes de la respuesta, sin opener, y le asigna la URL', async () => {
    const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
    const open = vi.fn(() => tab);
    vi.stubGlobal('open', open);
    renderCell(withPdf);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
    await waitFor(() => {
      expect(tab.location.href).toBe(URL.url);
    });
  });

  it('CA-19 si la API falla, "Abrir" cierra la pestaña', async () => {
    const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
    vi.stubGlobal(
      'open',
      vi.fn(() => tab),
    );
    vi.mocked(contractDocumentUrl).mockRejectedValue(new Error('x'));
    renderCell(withPdf);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await waitFor(() => {
      expect(tab.close).toHaveBeenCalled();
    });
  });

  it('CA-19b "Descargar" hace clic en un enlace a la URL firmada, sin iframe', async () => {
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.href);
    });
    renderCell(withWord);
    expect(screen.queryByRole('button', { name: 'Abrir' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    await waitFor(() => {
      expect(clicked).toEqual([URL.url]);
    });
    // La CSP de la web bloquearía un iframe hacia el almacenamiento.
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('CA-19b si la API falla, "Descargar" no navega', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    vi.mocked(contractDocumentUrl).mockRejectedValue(new Error('x'));
    renderCell(withWord);

    fireEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    await waitFor(() => {
      expect(contractDocumentUrl).toHaveBeenCalled();
    });
    expect(click).not.toHaveBeenCalled();
  });

  it('CA-18 reemplazar y eliminar piden confirmación', async () => {
    const onChanged = renderCell(withPdf);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(deleteContractDocument).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar documento' }));
    await waitFor(() => {
      expect(deleteContractDocument).toHaveBeenCalledWith(withPdf.id);
    });
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reemplazar' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/reemplaza/i);
  });
});
