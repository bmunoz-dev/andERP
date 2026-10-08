import { todayIn, weekOfMonth } from '@anderp/shared';
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';

/**
 * F07 CA-15: login → nuevo egreso → verlo en la matriz → nuevo pago de honorarios → verlo en
 * Honorarios → revelar una credencial → logout.
 *
 * Usa un admin existente (`E2E_EMAIL` y `E2E_PASSWORD`). Prestador, contrato y credencial se crean
 * por la API con nombres únicos, así la prueba se puede repetir sobre la misma base de datos.
 */
const email = process.env.E2E_EMAIL ?? '';
const password = process.env.E2E_PASSWORD ?? '';
const run = Date.now().toString(36);
const today = todayIn();
const [year, month, day] = today.split('-');
const shortDate = `${day ?? ''}/${month ?? ''}`;

test.skip(!email || !password, 'Define E2E_EMAIL y E2E_PASSWORD');

async function apiToken(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/v1/auth/login', { data: { email, password } });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function post<T>(request: APIRequestContext, token: string, path: string, data: object) {
  const res = await request.post(`/api/v1${path}`, {
    data,
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok(), `${path}: ${await res.text()}`).toBe(true);
  return (await res.json()) as T;
}

/** Elige una opción de un `SelectField` (Radix Select). */
async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

test('flujo de humo', async ({ page, request }) => {
  const token = await apiToken(request);
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const documentTypes = (await (
    await request.get('/api/v1/catalogs/document-types', auth)
  ).json()) as { id: string; code: string }[];
  const provider = await post<{ id: string }>(request, token, '/service-providers', {
    name: `Prestador E2E ${run}`,
    documentTypeId: documentTypes.find((d) => d.code === 'CC')?.id,
    documentNumber: String(Date.now()).slice(-10),
  });
  await post(request, token, `/service-providers/${provider.id}/contracts`, {
    startDate: `${year ?? ''}-${month ?? ''}-01`,
    workAgreement: 'Prueba de humo',
    paymentFrequency: 'weekly',
    totalAmount: '10000000.00',
  });
  await post(request, token, '/credentials', {
    entityName: `Portal E2E ${run}`,
    username: 'e2e',
    password: `Clave-${run}`,
  });

  // Login
  await page.goto('/login');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/egresos/);

  // Nuevo egreso y verlo en la matriz
  const concept = `Papelería E2E ${run}`;
  await page.getByRole('button', { name: 'Nuevo egreso' }).click();
  await choose(page, 'Departamento', 'Administrativo');
  await page.getByLabel('Concepto').fill(concept);
  await page.getByLabel('Valor').fill('12.345');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page
    .getByRole('button', { name: `Administrativo, semana ${String(weekOfMonth(today))}` })
    .click();
  await expect(page.getByRole('dialog').getByText(concept)).toBeVisible();
  await page.keyboard.press('Escape');

  // Nuevo pago de honorarios y verlo en Honorarios
  await page.goto('/honorarios/nuevo');
  await choose(page, 'Prestador (contrato vigente en esa semana)', new RegExp(run));
  await page.getByRole('textbox', { name: new RegExp(` ${shortDate}$`) }).fill('150.000');
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(page).toHaveURL(/\/honorarios$/);
  await expect(page.getByText(`Prestador E2E ${run}`)).toBeVisible();

  // Revelar una credencial
  await page.goto('/credenciales');
  await page.getByLabel('Buscar por entidad, usuario o responsable').fill(run);
  const row = page.getByRole('row', { name: new RegExp(`Portal E2E ${run}`) });
  await row.getByRole('button', { name: 'Revelar' }).click();
  await expect(row.getByText(`Clave-${run}`)).toBeVisible();

  // Logout
  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login/);
});
