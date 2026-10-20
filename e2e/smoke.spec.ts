import { expect, test, type Page } from '@playwright/test';

async function openMainTs(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explorar exemplo' }).click();
  await page.getByTitle('src', { exact: true }).click();
  await page.getByTitle('main.ts').click();
  await expect(page.locator('.monaco-editor')).toBeVisible();
}

test('abre na Central de IA sem erros no console', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'IA de graça, sem cartão.' })).toBeVisible();
  await expect(page.getByText('Monitor de IA')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Monaco real: editar, formatar com Shift+Alt+F e salvar com Ctrl+S', async ({ page }) => {
  await openMainTs(page);
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('const a={b:1}');
  await expect(page.getByText('alterações não salvas')).toBeVisible();
  await page.keyboard.press('Shift+Alt+F');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('const a = { b: 1 };');
  await page.keyboard.press('Control+S');
  await expect(page.getByText('salvo', { exact: true })).toBeVisible();
});

test('desfazer funciona depois de formatar', async ({ page }) => {
  await openMainTs(page);
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('let x=1');
  await page.getByRole('button', { name: /Formatar/ }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('let x = 1;');
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('Control+Z');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('let x=1');
});

test('abas preservam o conteúdo e o visual terminal troca o tema do editor', async ({ page }) => {
  await openMainTs(page);
  await page.getByTitle('styles.css').click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('--noite');
  await page.getByRole('button', { name: 'main.ts', exact: true }).click();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('Companheiro');
  await page.getByRole('button', { name: /moderno/ }).click();
  await expect(page.locator('.monaco-editor')).toHaveCSS('background-color', 'rgb(7, 10, 6)');
});

test('painéis redimensionam arrastando e o terminal abre com Ctrl+`', async ({ page }) => {
  await page.goto('/');
  const explorer = page.locator('.explorer');
  const before = (await explorer.boundingBox())!.width;
  const handle = page.getByRole('separator', { name: 'Redimensionar barra lateral' });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 124, box.y + 200, { steps: 6 });
  await page.mouse.up();
  expect((await explorer.boundingBox())!.width).toBeGreaterThan(before + 100);
  await page.getByRole('button', { name: 'Explorar exemplo' }).click();
  await page.keyboard.press('Control+Backquote');
  await expect(page.getByLabel('Comando do terminal')).toBeVisible();
});
