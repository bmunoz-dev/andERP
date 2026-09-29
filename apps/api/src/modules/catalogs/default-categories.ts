/** Categorías que recibe toda organización nueva (design.md §5.4). */
export const DEFAULT_EXPENSE_CATEGORIES: readonly {
  name: string;
  systemCode: string | null;
  sortOrder: number;
}[] = [
  { name: 'Administrativo', systemCode: null, sortOrder: 1 },
  { name: 'Honorarios', systemCode: 'FEES', sortOrder: 2 },
  { name: 'Comercial', systemCode: null, sortOrder: 3 },
  { name: 'Jurídico', systemCode: null, sortOrder: 4 },
  { name: 'Tributario', systemCode: null, sortOrder: 5 },
  { name: 'Nómina', systemCode: null, sortOrder: 6 },
  { name: 'Gastos extras', systemCode: null, sortOrder: 7 },
];

/** Valores iniciales de los catálogos globales (F02 CA-6). */
export const DEFAULT_DOCUMENT_TYPES: readonly { code: string; name: string }[] = [
  { code: 'CC', name: 'Cédula de ciudadanía' },
  { code: 'NIT', name: 'NIT' },
  { code: 'CE', name: 'Cédula de extranjería' },
  { code: 'PAS', name: 'Pasaporte' },
  { code: 'TI', name: 'Tarjeta de identidad' },
  { code: 'PPT', name: 'Permiso por Protección Temporal' },
];

export const DEFAULT_ACCOUNT_TYPES: readonly string[] = ['Ahorros', 'Corriente'];

export const DEFAULT_BANKS: readonly string[] = [
  'Bancolombia',
  'Banco de Bogotá',
  'Davivienda',
  'BBVA Colombia',
  'Banco de Occidente',
  'Banco Popular',
  'Scotiabank Colpatria',
  'Banco AV Villas',
  'Banco Caja Social',
  'Banco Agrario de Colombia',
  'Itaú',
  'Banco GNB Sudameris',
  'Banco Falabella',
  'Banco Pichincha',
  'Bancoomeva',
  'Banco Finandina',
  'Banco W',
  'Lulo Bank',
  'Nu Colombia',
  'Nequi',
  'Daviplata',
];
