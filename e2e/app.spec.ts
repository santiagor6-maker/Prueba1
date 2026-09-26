import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const shots = process.env.SHOTS_DIR;

async function loadDemo(page: Page) {
  // file:// pages share one storage origin across browser contexts: start every test from an empty database.
  await page.goto('');
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('investment-tracker'); q.onsuccess = q.onerror = q.onblocked = r; }));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Empezar' })).toBeVisible();
  await page.getByRole('button', { name: 'Cargar demostración' }).first().click();
  await expect(page.locator('.hero .kicker')).toHaveText('Valor del portafolio');
}

test('demo portfolio: summary, positions, comparison, persistence', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await loadDemo(page);

  await page.getByRole('link', { name: 'Resumen' }).click();
  await expect(page.getByText('Tu rentabilidad (XIRR, anual)')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Acciones USD' })).toBeVisible();
  await expect(page.locator('.class-card').filter({ hasText: 'Acciones USD' }).getByText('Índice demo (retorno total)').first()).toBeVisible();
  await expect(page.locator('.notice.err')).toHaveCount(0);
  const value = await page.locator('.hero .figure').textContent();
  expect(value).toMatch(/\$ \d/);
  if (shots) await page.screenshot({ path: `${shots}/resumen-${info.project.name}.png`, fullPage: true });

  await page.getByRole('button', { name: 'USD' }).click();
  await expect(page.locator('.hero .figure')).toContainText('US$');

  await page.getByRole('link', { name: 'Activos' }).click();
  await expect(page.getByRole('cell', { name: /Copy portfolio Tech \(demo\)/ })).toBeVisible();
  await expect(page.getByText(/precio de lista .* anual sin apalancamiento/)).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/activos-${info.project.name}.png`, fullPage: true });

  await page.getByRole('link', { name: 'Comparación' }).click();
  await expect(page.locator('.card .chart svg path.series')).toHaveCount(2);
  if (shots) await page.screenshot({ path: `${shots}/comparacion-${info.project.name}.png`, fullPage: true });

  await page.reload();
  await page.getByRole('link', { name: 'Movimientos' }).click();
  await expect(page.getByText(/\d+ movimientos/)).toContainText('43 movimientos');
  expect(errors).toEqual([]);
});

test('record a buy, reject an oversell, record a sale', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('link', { name: 'Movimientos' }).click();

  await page.getByRole('button', { name: '+ Registrar movimiento' }).click();
  const form = page.getByRole('form', { name: 'Nuevo movimiento' });
  await form.getByLabel('Fecha').fill('2025-06-10');
  await form.getByRole('combobox', { name: /^Cuenta/ }).selectOption('broker-usd');
  await form.getByRole('combobox', { name: /^Activo/ }).selectOption('SMPL');
  await form.getByLabel('Cantidad (unidades)').fill('2');
  await form.getByLabel(/Total pagado/).fill('250,50');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('44 movimientos')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'US$ -250,50' })).toBeVisible();

  await page.getByRole('button', { name: '+ Registrar movimiento' }).click();
  await form.getByRole('combobox', { name: /^Tipo/ }).selectOption('SELL');
  await form.getByLabel('Fecha').fill('2025-06-11');
  await form.getByRole('combobox', { name: /^Cuenta/ }).selectOption('broker-usd');
  await form.getByRole('combobox', { name: /^Activo/ }).selectOption('SMPL');
  await expect(form.getByText('Tienes 30 a esa fecha')).toBeVisible();
  await form.getByLabel('Cantidad (unidades)').fill('31');
  await form.getByLabel(/Total recibido/).fill('4000');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(form.getByRole('alert')).toContainText('excede la posición');
  await expect(page.getByText('44 movimientos')).toBeVisible();

  await form.getByLabel('Cantidad (unidades)').fill('10');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('45 movimientos')).toBeVisible();
});

test('buy a new asset created inline', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('link', { name: 'Movimientos' }).click();
  await page.getByRole('button', { name: '+ Registrar movimiento' }).click();
  const form = page.getByRole('form', { name: 'Nuevo movimiento' });
  await form.getByLabel('Fecha').fill('2025-06-12');
  await form.getByRole('combobox', { name: /^Cuenta/ }).selectOption('broker-usd');
  await form.getByRole('combobox', { name: /^Activo/ }).selectOption('__new__');
  await form.getByLabel('Código').fill('NEWCO');
  await form.getByLabel('Nombre').fill('New Co');
  await form.getByLabel('Cantidad (unidades)').fill('1');
  await form.getByLabel(/Total pagado/).fill('10');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('cell', { name: 'New Co' })).toBeVisible();
  await page.getByRole('link', { name: 'Activos' }).click();
  await expect(page.getByText('al costo · falta dato')).toBeVisible();
});

test('month-end close: enter copy portfolio value', async ({ page }, info) => {
  await loadDemo(page);
  await page.getByRole('link', { name: 'Cierre mensual', exact: true }).click();
  await page.getByRole('combobox', { name: /^Mes/ }).selectOption('2025-07-31');
  const input = page.getByLabel('Valor de Copy portfolio Tech (demo) al 2025-07-31');
  await expect(input).toBeVisible();
  await input.fill('1.702,35');
  if (shots) await page.screenshot({ path: `${shots}/cierre-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: /Guardar cierre/ }).click();
  await expect(page.getByRole('status')).toContainText('Guardados 1 valores');
  await expect(page.getByText('Ya registrado: US$ 1.702,35')).toBeVisible();

  await page.getByRole('link', { name: 'Movimientos' }).click();
  await page.getByLabel('Buscar activo o nota').fill('copy');
  await expect(page.getByRole('cell', { name: 'US$ 1.702,35' })).toBeVisible();
});
