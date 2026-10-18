import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { enterDefaultTeam } from './helpers';

test('selección inicial, crear equipo y adaptar la navegación sin mezclar plantillas', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Elige tu equipo.' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Principal', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Nuevo equipo', exact: true }).click();
  const name = `Equipo propio ${Date.now()}`;
  await page.getByLabel('Nombre del equipo', { exact: true }).fill(name);
  await page.getByLabel('Categoría', { exact: true }).fill('Infantil femenino');
  await page.getByRole('button', { name: 'Crear y entrar' }).click();
  await expect(page.locator('.team-card')).toContainText(name);
  await expect(page.locator('.team-card')).toContainText('Infantil femenino');
  await expect(page.locator('.breadcrumb')).toContainText(name);
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('button', { name: 'Plantilla', exact: true })
    .click();
  await expect(page.locator('.player-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cambiar equipo', exact: true }).click();
  await enterDefaultTeam(page);
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('button', { name: 'Plantilla', exact: true })
    .click();
  expect(await page.locator('.player-card').count()).toBeGreaterThanOrEqual(12);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Elige tu equipo.' })).toBeVisible();
});

test('fotos guardadas en fichas y visibles en pista y banquillo después de recargar', async ({
  page,
}) => {
  await page.goto('/');
  await enterDefaultTeam(page);
  const initial = (await (await page.request.get('/api/workspace')).json()).state;
  const image = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#00c4d5' },
  })
    .png()
    .toBuffer();
  const upload = await page.request.post('/api/player-photo', {
    headers: { origin: 'http://127.0.0.1:3002' },
    multipart: { photo: { name: 'test.png', mimeType: 'image/png', buffer: image } },
  });
  expect(upload.status()).toBe(201);
  const photo = (await upload.json()).photo;
  expect(photo).not.toContain('data:');
  const served = await page.request.get(photo);
  expect(served.headers()['content-type']).toBe('image/webp');
  for (const index of [0, 5]) {
    const state = (await (await page.request.get('/api/workspace')).json()).state;
    const player = initial.players[index];
    const saved = await page.request.post('/api/workspace', {
      headers: { origin: 'http://127.0.0.1:3002' },
      data: {
        action: 'player',
        version: state.version,
        mutationId: crypto.randomUUID(),
        payload: { ...player, photo },
      },
    });
    expect(saved.ok()).toBe(true);
  }
  await page.reload();
  await enterDefaultTeam(page);
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('button', { name: 'Anotador en directo' })
    .click();
  await page.locator('.practice-link').click();
  await expect(page.locator('.live-five .player-portrait img').first()).toBeVisible();
  await expect(page.locator('.live-bench .player-portrait img').first()).toBeVisible();
  await expect(page.locator('.live-five .portrait-number')).toHaveCount(5);
  expect(await page.locator('.live-bench .portrait-number').count()).toBeGreaterThan(0);
  const foreign = await page.request.post('/api/player-photo', {
    headers: { origin: 'https://foreign.invalid' },
    multipart: { photo: { name: 'test.png', mimeType: 'image/png', buffer: image } },
  });
  expect(foreign.status()).toBe(403);
  const invalid = await page.request.post('/api/player-photo', {
    headers: { origin: 'http://127.0.0.1:3002' },
    multipart: {
      photo: { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') },
    },
  });
  expect(invalid.status()).toBe(400);
});
