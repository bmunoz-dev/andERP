import { CONTRACT_DOCUMENT_TYPES, type ContractDocumentType } from '@anderp/shared';

const SIGNATURES: Record<ContractDocumentType, number[]> = {
  'application/pdf': [...Buffer.from('%PDF-')],
  // .docx es un ZIP; no se mira su interior (límite aceptado en CA-4).
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    0x50, 0x4b, 0x03, 0x04,
  ],
  // Firma OLE: la comparten .xls y .msi (límite aceptado en CA-4).
  'application/msword': [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
};

/** F17 CA-4: el tipo sale de la extensión y tiene que coincidir con los primeros bytes. */
export function detectDocumentType(bytes: Buffer, fileName: string): ContractDocumentType | null {
  const dot = fileName.lastIndexOf('.');
  const extension = dot === -1 ? '' : fileName.slice(dot).toLowerCase();
  const type = (CONTRACT_DOCUMENT_TYPES as Record<string, ContractDocumentType | undefined>)[
    extension
  ];
  if (!type) return null;
  const signature = SIGNATURES[type];
  return signature.every((byte, i) => bytes[i] === byte) ? type : null;
}

/**
 * F17 CA-4b: multer entrega `originalname` decodificado como latin1; el navegador lo manda en
 * UTF-8. Se recupera el texto, se deja el nombre base y se limita a 255 caracteres (la columna).
 */
export function normalizeFileName(originalName: string): string | null {
  const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
  const base = (decoded.split(/[\\/]/).pop() ?? '').trim();
  return base.length >= 1 && base.length <= 255 ? base : null;
}

/**
 * F17 CA-9 y CA-10: se guarda con el objeto. El PDF se abre en el visor; el Word se descarga.
 * `filename*` lleva el nombre real; `filename` es la alternativa ASCII para clientes viejos.
 */
export function contentDisposition(type: ContractDocumentType, fileName: string): string {
  const ascii = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/["\\/]|[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const kind = type === 'application/pdf' ? 'inline' : 'attachment';
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
