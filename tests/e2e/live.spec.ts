import { test, expect } from '@playwright/test';
import { enterDefaultTeam } from './helpers';

test('el anotador empieza por tarjetas y abre únicamente el partido elegido', async ({ page }) => {
  await page.goto('/');
  await enterDefaultTeam(page);
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('button', { name: 'Anotador en directo' })
    .click();
  await expect(page.getByRole('heading', { name: 'Elige el partido.', exact: true })).toBeVisible();
  await expect(page.getByTestId('score-ours')).not.toBeVisible();
  const state = (await (await page.request.get('/api/workspace')).json()).state;
  const scheduled = state.games.find((game: { status: string }) => game.status === 'SCHEDULED');
  await page.getByRole('button', { name: 'Próximos', exact: true }).click();
  await page
    .locator(`[data-game-id="${scheduled.id}"]`)
    .getByRole('button', { name: 'Preparar partido' })
    .click();
  await expect(page.locator('.current-match-name')).toContainText(scheduled.opponent);
  await expect(
    page.getByRole('heading', { name: 'Tu partido, listo en dos pasos.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Volver a partidos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Elige el partido.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva simulación', exact: true }).click();
  await expect(page.getByTestId('score-ours')).toHaveText('0');
  await page.getByRole('button', { name: 'Iniciar reloj', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Volver a partidos', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Parar reloj', exact: true }).click();
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  await page.getByRole('button', { name: 'Volver a partidos', exact: true }).click();
  await page.getByRole('button', { name: 'Simulaciones', exact: true }).click();
  expect(await page.locator('.match-choice-card').count()).toBeGreaterThan(0);
});

async function openPractice(page: import('@playwright/test').Page) {
  await page.goto('/');
  await enterDefaultTeam(page);
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('button', { name: 'Anotador en directo' })
    .click();
  await page.locator('.practice-link').click();
  await expect(page.locator('.practice-banner')).toBeVisible();
  await expect(page.locator('.live-five button')).toHaveCount(5);
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
}

test('nueva prueba abre la recién creada aunque MongoDB devuelva partidos futuros al final', async ({
  page,
}) => {
  await page.route('**/api/workspace*', async (route) => {
    if (
      route.request().method() === 'POST' &&
      route.request().postDataJSON().action === 'practice'
    ) {
      const response = await route.fetch();
      const body = await response.json();
      body.state.games.sort((a: { date: string }, b: { date: string }) =>
        a.date.localeCompare(b.date),
      );
      await route.fulfill({ response, json: body });
    } else await route.continue();
  });
  await openPractice(page);
  await expect(page.getByTestId('live-period')).toHaveText('CUARTO 1 / 4');
  await expect(page.getByTestId('live-clock')).toHaveText('10:00');
  await expect(page.getByRole('button', { name: 'Iniciar reloj', exact: true })).toBeVisible();
});
test('prueba en un clic, captura rápida en cola y exclusión de estadísticas', async ({ page }) => {
  await page.goto('/');
  await enterDefaultTeam(page);
  await expect(page.locator('.kpi-grid')).toBeVisible();
  const official = await page.locator('.kpi-grid').innerText();
  await openPractice(page);
  await page.route('**/api/workspace*', async (route) => {
    if (route.request().method() === 'POST')
      await new Promise((resolve) => setTimeout(resolve, 150));
    await route.continue();
  });
  const shot = page.getByRole('button', { name: 'T2 anotado', exact: true });
  for (let i = 0; i < 5; i++) await shot.click();
  await expect(page.getByTestId('score-ours')).toHaveText('10');
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  await page.getByRole('button', { name: 'Rival más 3', exact: true }).click();
  await expect(page.getByTestId('score-opponent')).toHaveText('3');
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  await page.getByRole('button', { name: /Deshacer última acción/ }).click();
  await expect(page.getByTestId('score-opponent')).toHaveText('0');
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('button', { name: 'Vista general', exact: true })
    .click();
  await expect(page.locator('.kpi-grid')).toBeVisible();
  expect(await page.locator('.kpi-grid').innerText()).toBe(official);
});
test('sustitución sin diálogo, selección por acción y atajos', async ({ page }) => {
  await openPractice(page);
  await page.getByRole('button', { name: 'Cambio', exact: true }).click();
  await page.locator('.live-five button').first().click();
  const name = await page.locator('.live-bench button').first().innerText();
  await page.locator('.live-bench button').first().click();
  await expect(page.locator('.live-bench')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cambio', exact: true })).toBeVisible();
  await expect(page.locator('.live-five button')).toHaveCount(5);
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  const benchPlayer = await page.locator('.live-bench button').first().getAttribute('aria-label');
  await page.locator('.live-bench button').first().click();
  await expect(page.getByRole('button', { name: 'Cancelar cambio', exact: true })).toBeVisible();
  await page.locator('.live-five button').nth(1).click();
  await expect(page.getByRole('button', { name: 'Cambio', exact: true })).toBeVisible();
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  expect(await page.locator('.live-five').innerText()).toContain(
    benchPlayer!.replace('Dar entrada a ', '').split(', dorsal')[0],
  );
  await page.getByRole('button', { name: 'Acción → jugador', exact: true }).click();
  await page.getByRole('button', { name: 'T3 anotado', exact: true }).click();
  await expect(page.locator('.selected-player-strip')).toContainText('Ahora toca un jugador');
  await page.locator('.live-five button').nth(1).click();
  await expect(page.getByTestId('score-ours')).toHaveText('3');
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  await page.getByRole('button', { name: 'Jugador → acción', exact: true }).click();
  await page.keyboard.press('3');
  await page.keyboard.press('q');
  await expect(page.getByTestId('score-ours')).toHaveText('5');
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  await page.keyboard.press('z');
  await expect(page.getByTestId('score-ours')).toHaveText('3');
});
test('la cola conserva el identificador al reintentar una respuesta perdida', async ({ page }) => {
  await openPractice(page);
  let failed = false;
  const ids: string[] = [];
  await page.route('**/api/workspace*', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body.action === 'event') {
        ids.push(body.mutationId);
        if (!failed) {
          failed = true;
          const response = await route.fetch();
          await route.abort('failed');
          return;
        }
      }
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'T3 anotado', exact: true }).click();
  await expect(page.locator('.live-sync')).toContainText('Guardado pendiente');
  await page.getByRole('button', { name: 'Reintentar guardado', exact: true }).click();
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  await expect(page.getByTestId('score-ours')).toHaveText('3');
  expect(ids.length).toBe(2);
  expect(ids[0]).toBe(ids[1]);
});
test('reloj y captura permanecen visibles a 375, 820 y 1440', async ({ page }) => {
  await openPractice(page);
  for (const width of [375, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByTestId('score-ours')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `test-results/live-new-${width}.png`, fullPage: true });
    await page.locator('.live-actions').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('live-clock')).toBeInViewport();
  }
});

test('simulación avanza cuartos, conserva marcador y guarda el periodo', async ({ page }) => {
  await openPractice(page);
  await expect(page.getByTestId('live-period')).toHaveText('CUARTO 1 / 4');
  await page
    .locator('.live-score-strip')
    .getByRole('button', { name: 'Rival más 2', exact: true })
    .click();
  await expect(page.getByTestId('score-opponent')).toHaveText('2');
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  await page.getByRole('button', { name: 'Simular fin de cuarto', exact: true }).click();
  await expect(page.getByTestId('live-period')).toHaveText('CUARTO 2 / 4');
  await expect(page.getByTestId('live-clock')).toHaveText('10:00');
  await expect(page.getByTestId('score-opponent')).toHaveText('2');
  await expect(page.getByRole('button', { name: 'Iniciar reloj', exact: true })).toBeVisible();
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  const state = (await (await page.request.get('/api/workspace')).json()).state;
  const match = state.games.at(-1);
  expect(match.period).toBe(2);
  expect(match.elapsed).toBe(600);
  expect(match.isPractice).toBe(true);
  for (const quarter of [3, 4]) {
    await page.getByRole('button', { name: 'Simular fin de cuarto', exact: true }).click();
    await expect(page.getByTestId('live-period')).toHaveText(`CUARTO ${quarter} / 4`);
    await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  }
  await page.getByRole('button', { name: 'Simular fin del partido', exact: true }).click();
  await expect(page.getByTestId('live-clock')).toHaveText('00:00');
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  const finished = (await (await page.request.get('/api/workspace')).json()).state.games.at(-1);
  expect(finished.period).toBe(4);
  expect(finished.elapsed).toBe(2400);
});

test('arrastrar entre quinteto y banquillo sustituye y persiste ambos sentidos', async ({
  page,
}) => {
  await openPractice(page);
  await expect(page.getByRole('heading', { name: '1 Quinteto', exact: true })).toBeVisible();
  const first = page.locator('.live-five button').first();
  const substitute = page.locator('.live-bench button').first();
  const outgoing = await first.getAttribute('data-player-id');
  const incoming = await substitute.getAttribute('data-player-id');
  await first.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await expect(substitute).toBeEnabled();
  await substitute.dragTo(first);
  await expect(page.locator(`.live-five [data-player-id="${incoming}"]`)).toBeVisible();
  await expect(page.locator(`.live-bench [data-player-id="${outgoing}"]`)).toBeVisible();
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  await page
    .locator(`.live-five [data-player-id="${incoming}"]`)
    .dragTo(page.locator(`.live-bench [data-player-id="${outgoing}"]`));
  await expect(page.locator(`.live-five [data-player-id="${outgoing}"]`)).toBeVisible();
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  const state = (await (await page.request.get('/api/workspace')).json()).state;
  const changes = state.games
    .at(-1)
    .events.filter((e: { type: string }) => e.type === 'SUBSTITUTION');
  expect(changes).toHaveLength(2);
  expect(changes[1].lineup).toContain(outgoing);
  expect(new Set(changes[1].lineup).size).toBe(5);
});

test('la tarjeta sigue al ratón y resalta el destino antes de soltar', async ({ page }) => {
  await openPractice(page);
  const target = page.locator('.live-five button').first();
  const source = page.locator('.live-bench button').first();
  await target.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await expect(source).toHaveAttribute('draggable', 'true');
  const id = await source.getAttribute('data-player-id');
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 15, from.y + from.height / 2 - 15, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await expect(page.getByTestId('player-drag-preview')).toBeVisible();
  await expect(source).toHaveAttribute('data-dragging', 'true');
  await expect(target).toHaveAttribute('data-drop-target', 'true');
  await page.screenshot({ path: 'docs/screenshots/player-drag-in-progress.png' });
  await page.mouse.up();
  await expect(page.getByTestId('player-drag-preview')).not.toBeVisible();
  await expect(page.locator(`.live-five [data-player-id="${id}"]`)).toBeVisible();
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  // A card dropped within the same group must not record a substitution.
  const before = (await (await page.request.get('/api/workspace')).json()).state.games.at(-1).events
    .length;
  await page.locator('.live-five button').first().dragTo(page.locator('.live-five button').nth(1));
  expect(
    (await (await page.request.get('/api/workspace')).json()).state.games.at(-1).events.length,
  ).toBe(before);
});

test('arrastre táctil real cambia jugadores sin exigir el botón Cambio', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 820, height: 1100 },
  });
  const page = await context.newPage();
  try {
    await openPractice(page);
    const target = page.locator('.live-five button').first();
    const source = page.locator('.live-bench button').first();
    await target.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    const id = await source.getAttribute('data-player-id');
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;
    const cdp = await context.newCDPSession(page);
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let step = 1; step <= 8; step++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: start.x + ((end.x - start.x) * step) / 8,
            y: start.y + ((end.y - start.y) * step) / 8,
          },
        ],
      });
    await expect(page.getByTestId('player-drag-preview')).toBeVisible();
    await expect(target).toHaveAttribute('data-drop-target', 'true');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator(`.live-five [data-player-id="${id}"]`)).toBeVisible();
    await expect(page.getByTestId('player-drag-preview')).not.toBeVisible();
    await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  } finally {
    await context.close();
  }
});

test('el reloj agotado se guarda y el nuevo cuarto no se agota automáticamente', async ({
  page,
}) => {
  await openPractice(page);
  await page.getByRole('button', { name: 'Ajustar reloj', exact: true }).click();
  await page.getByLabel('Tiempo oficial (mm:ss)').fill('00:01');
  await page.getByRole('button', { name: 'Guardar reloj', exact: true }).click();
  await expect(page.getByTestId('live-clock')).toHaveText('00:01');
  await page.getByRole('button', { name: 'Iniciar reloj', exact: true }).click();
  await expect(page.getByTestId('live-clock')).toHaveText('00:00');
  await expect(page.getByRole('button', { name: 'Siguiente cuarto', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Siguiente cuarto', exact: true }).click();
  await expect(page.getByTestId('live-period')).toHaveText('CUARTO 2 / 4');
  await expect(page.getByTestId('live-clock')).toHaveText('10:00');
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  const game = (await (await page.request.get('/api/workspace')).json()).state.games.at(-1);
  expect(game.period).toBe(2);
  expect(game.remaining).toBe(600);
  expect(game.elapsed).toBe(600);
});

test('estadísticas del partido actualizan acciones, correcciones, minutos y quinteto', async ({
  page,
}) => {
  await openPractice(page);
  await page.getByRole('button', { name: 'Jugador → acción', exact: true }).click();
  const id = await page.locator('.live-five button').first().getAttribute('data-player-id');
  await page.locator('.live-five button').first().click();
  const stats = page.locator('#live-match-stats');
  const row = page.getByTestId(`match-stats-${id}`);
  await expect(row).toHaveCSS('display', 'table-row');
  await expect(stats.getByRole('heading', { name: 'Estadísticas de este partido' })).toBeVisible();
  await page.route('**/api/workspace*', async (route) => {
    if (route.request().method() === 'POST')
      await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await page.getByRole('button', { name: 'T3 anotado', exact: true }).click();
  await expect(stats.getByText('Incluye acciones pendientes de guardar')).toBeVisible();
  await expect(row.locator('[data-stat="Pts"]')).toHaveText('3');
  await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  for (const action of ['Rebote defensivo', 'Asistencia', 'Falta cometida']) {
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect(page.locator('.live-sync')).toContainText('Todo guardado');
  }
  await expect(stats.getByTestId('match-total-Puntos')).toHaveText('3');
  await expect(row.locator('[data-stat="TReb"]')).toHaveText('1');
  await expect(row.locator('[data-stat="Asis"]')).toHaveText('1');
  await expect(row.locator('[data-stat="Falt"]')).toHaveText('1');
  await expect(row.locator('[data-stat="Val"]')).toHaveText('4');
  await page.getByRole('button', { name: /Deshacer última acción/ }).click();
  await expect(row.locator('[data-stat="Falt"]')).toHaveText('0');
  await expect(row.locator('[data-stat="Val"]')).toHaveText('5');
  await stats.getByRole('button', { name: 'Ver todas las estadísticas', exact: true }).click();
  await expect(row.locator('[data-stat="T3%"]')).toHaveText('100%');
  await expect(row.locator('[data-stat="T3I"]')).toHaveText('1');
  await stats.getByRole('button', { name: 'Quinteto en pista', exact: true }).click();
  await expect(stats.locator('tbody tr')).toHaveCount(5);
  await page.getByRole('button', { name: 'Simular fin de cuarto', exact: true }).click();
  await expect(page.getByTestId('live-period')).toHaveText('CUARTO 2 / 4');
  await expect(row.locator('[data-stat="Min"]')).toHaveText('10:00');
  await expect(stats.locator('tfoot [data-stat="Min"]')).toHaveText('50:00');
  await page.locator('.live-bench button').first().click();
  await page.locator(`.live-five [data-player-id="${id}"]`).click();
  await expect(row).not.toBeVisible();
  await expect(stats.locator('tbody tr')).toHaveCount(5);
  await stats.getByRole('button', { name: 'Todos los convocados', exact: true }).click();
  await expect(row).toContainText('Banquillo');
  await expect(row.locator('[data-stat="Pts"]')).toHaveText('3');
  await expect(stats.getByTestId('match-total-Puntos')).toHaveText('3');
  for (const width of [375, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
