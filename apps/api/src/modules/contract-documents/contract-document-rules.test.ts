import { describe, expect, it } from 'vitest';
import {
  contentDisposition,
  detectDocumentType,
  normalizeFileName,
} from './contract-document-rules';

const PDF = Buffer.from('%PDF-1.7\n…');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
const EXE = Buffer.from('MZ\x90\x00');

describe('detectDocumentType (F17 CA-4)', () => {
  it.each([
    [PDF, 'contrato.pdf', 'application/pdf'],
    [PDF, 'CONTRATO.PDF', 'application/pdf'],
    [
      ZIP,
      'contrato.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    [OLE, 'contrato.doc', 'application/msword'],
  ])('acepta %#', (bytes, name, type) => {
    expect(detectDocumentType(bytes, name)).toBe(type);
  });

  it.each([
    [EXE, 'contrato.pdf'],
    [ZIP, 'contrato.pdf'],
    [PDF, 'contrato.docx'],
    [OLE, 'contrato.docx'],
    [PDF, 'contrato'],
    [Buffer.from('%PD'), 'corto.pdf'],
  ])('rechaza %#', (bytes, name) => {
    expect(detectDocumentType(bytes, name)).toBeNull();
  });
});

describe('normalizeFileName (F17 CA-4b)', () => {
  it('corrige el latin1 de multer: "Contratación.pdf" conserva su tilde', () => {
    const asMulterGivesIt = Buffer.from('Contratación.pdf', 'utf8').toString('latin1');
    expect(normalizeFileName(asMulterGivesIt)).toBe('Contratación.pdf');
  });

  it('deja solo el nombre base', () => {
    expect(normalizeFileName('C:\\fakepath\\contrato.pdf')).toBe('contrato.pdf');
    expect(normalizeFileName('carpeta/contrato.pdf')).toBe('contrato.pdf');
  });

  it('rechaza un nombre vacío o de más de 255 caracteres', () => {
    expect(normalizeFileName('')).toBeNull();
    expect(normalizeFileName('C:\\fakepath\\')).toBeNull();
    expect(normalizeFileName(`${'a'.repeat(252)}.pdf`)).toBeNull();
    expect(normalizeFileName(`${'a'.repeat(251)}.pdf`)).toHaveLength(255);
  });
});

describe('contentDisposition (F17 CA-9 y CA-10)', () => {
  it('un PDF se abre y un Word se descarga, con el nombre en UTF-8', () => {
    expect(contentDisposition('application/pdf', 'Contratación.pdf')).toBe(
      'inline; filename="Contratacion.pdf"; filename*=UTF-8\'\'Contrataci%C3%B3n.pdf',
    );
    expect(contentDisposition('application/msword', 'contrato.doc')).toBe(
      'attachment; filename="contrato.doc"; filename*=UTF-8\'\'contrato.doc',
    );
  });

  it('el nombre alternativo no tiene comillas, barras ni caracteres de control', () => {
    expect(contentDisposition('application/pdf', 'a"b\\c/d\u0007(1)*.pdf')).toBe(
      'inline; filename="a_b_c_d_(1)*.pdf"; filename*=UTF-8\'\'a%22b%5Cc%2Fd%07%281%29%2A.pdf',
    );
  });
});
