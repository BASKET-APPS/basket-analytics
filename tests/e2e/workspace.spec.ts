import { test, expect } from '@playwright/test';
import { enterDefaultTeam } from './helpers';
test('dashboard y responsive a 375, 820 y 1440', async ({ page }) => {
  for (const width of [375, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await enterDefaultTeam(page);
    await expect(page.getByRole('heading', { name: 'El equipo, en perspectiva.' })).toBeVisible();
    await expect(page.getByText('JUNTOS,')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/dashboard-${width}.png`, fullPage: true });
  }
});
test('alta de jugador, persistencia, partido, quinteto, tiros y deshacer', async ({ page }) => {
  await page.goto('/');
  await enterDefaultTeam(page);
  await expect(page.getByRole('heading', { name: 'El equipo, en perspectiva.' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('button', { name: 'Plantilla', exact: true })
    .click();
  await page.getByRole('button', { name: 'Añadir jugador' }).click();
  const current = (await (await page.request.get('/api/workspace')).json()).state;
  const number = Array.from({ length: 100 }, (_, i) => 99 - i).find(
    (n) =>
      !current.players.some((p: { number: number; active: boolean }) => p.active && p.number === n),
  )!;
  const playerName = 'Prueba E2E ' + Date.now();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre visible').fill(playerName);
  await dialog.getByLabel('Dorsal').fill(String(number));
  await dialog.getByRole('button', { name: 'Confirmar y guardar' }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await enterDefaultTeam(page);
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('button', { name: 'Plantilla', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: playerName })).toBeVisible();
  const rivalName = 'Rival prueba ' + Date.now();
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('button', { name: 'Partidos', exact: true })
    .click();
  await page.getByRole('button', { name: 'Nuevo partido', exact: true }).click();
  await dialog.getByLabel('Equipo rival').fill(rivalName);
  await dialog.getByLabel('Fecha y hora').fill('2026-10-25T18:00');
  await dialog.getByRole('button', { name: 'Confirmar y guardar' }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .locator('.game-list-row')
    .filter({ hasText: rivalName })
    .getByRole('button', { name: 'Abrir' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Tu partido, listo en dos pasos.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Elegir titulares', exact: true }).click();
  await page.getByRole('button', { name: 'Seleccionar primeros cinco', exact: true }).click();
  await page.getByRole('button', { name: 'Comenzar partido con estos 5', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Iniciar reloj', exact: true })).toBeVisible();
  await page.locator('.live-five button').first().click();
  for (const action of ['T3 anotado', 'T3 anotado', 'T3 fallado', 'TL anotado'])
    await page.getByRole('button', { name: action, exact: true }).click();
  await expect(page.getByTestId('score-ours')).toHaveText('7');
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  await page.getByRole('button', { name: /Deshacer última acción/ }).click();
  await expect(page.getByTestId('score-ours')).toHaveText('6');
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  const updated = (await (await page.request.get('/api/workspace')).json()).state;
  const matchId = updated.games.find((g: { opponent: string }) => g.opponent === rivalName).id;
  await page.reload();
  await enterDefaultTeam(page);
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('button', { name: 'Anotador en directo' })
    .click();
  await page.locator(`[data-game-id="${matchId}"]`).getByRole('button').click();
  await expect(page.getByTestId('score-ours')).toHaveText('6');
});

test('API rechaza origen ajeno y versiones obsoletas', async ({ request }) => {
  const state = (await (await request.get('/api/workspace')).json()).state;
  const payload = {
    action: 'player',
    version: state.version + 100,
    mutationId: crypto.randomUUID(),
    payload: { name: 'No guardar', number: 99, position: 'Base' },
  };
  expect(
    (
      await request.post('/api/workspace', {
        data: payload,
        headers: { Origin: 'https://otro.test' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post('/api/workspace', {
        data: payload,
        headers: { Origin: 'http://127.0.0.1:3002' },
      })
    ).status(),
  ).toBe(409);
});
test('crea temporada, copia plantilla y conserva histórico anterior', async ({ page }) => {
  await page.goto('/');
  await enterDefaultTeam(page);
  await expect(page.getByRole('heading', { name: 'El equipo, en perspectiva.' })).toBeVisible();
  await page.getByRole('button', { name: 'Configuración del equipo', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva temporada', exact: true }).click();
  const d = page.getByRole('dialog');
  const name = 'Temporada prueba ' + Date.now();
  await d.getByLabel('Nombre de la temporada').fill(name);
  await d.getByRole('button', { name: 'Confirmar y guardar' }).click();
  await expect(d).not.toBeVisible();
  await expect(page.getByLabel('Equipo y temporada')).toContainText(name);
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('button', { name: 'Plantilla', exact: true })
    .click();
  expect(await page.locator('.player-card').count()).toBeGreaterThanOrEqual(12);
  await page
    .getByLabel('Equipo y temporada')
    .selectOption('10000000-0000-4000-8000-000000000001:40000000-0000-4000-8000-000000000001');
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('button', { name: 'Partidos', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Calendario de competición' })).toBeVisible();
  expect(await page.locator('.game-list-row').count()).toBeGreaterThanOrEqual(7);
});
test('plantilla, estadísticas y anotador caben en móvil, tablet y escritorio', async ({ page }) => {
  for (const width of [375, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await enterDefaultTeam(page);
    await expect(page.getByRole('heading', { name: 'El equipo, en perspectiva.' })).toBeVisible();
    const nav =
      width < 600
        ? page.getByRole('navigation', { name: 'Navegación móvil' })
        : page.getByRole('navigation', { name: 'Principal', exact: true });
    for (const [label, heading, shot] of [
      ['Plantilla', 'Talento que suma.', 'players'],
      ['Estadísticas', 'Los datos hablan.', 'stats'],
      [width < 600 ? 'Directo' : 'Anotador en directo', 'Elige el partido.', 'scorer'],
    ]) {
      await nav.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `test-results/${shot}-${width}.png`, fullPage: true });
    }
  }
});
