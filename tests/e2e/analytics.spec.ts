import { test, expect, type APIRequestContext } from '@playwright/test';
import { enterDefaultTeam } from './helpers';

async function chartFixture(request: APIRequestContext) {
  const initial = (await (await request.get('/api/workspace')).json()).state;
  const players = initial.players
    .filter((player: { active: boolean }) => player.active)
    .slice(0, 6);
  const command = async (action: string, payload: Record<string, unknown>, gameId?: string) => {
    const state = (await (await request.get('/api/workspace')).json()).state;
    const response = await request.post('/api/workspace', {
      headers: { origin: 'http://127.0.0.1:3002' },
      data: { action, payload, gameId, version: state.version, mutationId: crypto.randomUUID() },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()).state;
  };
  const state = await command('game', {
    opponent: `Gráficas ${Date.now()}`,
    date: '2026-11-05T17:00:00.000Z',
    timezone: 'Europe/Madrid',
    venue: 'HOME',
    competition: 'Prueba de gráficas',
    rules: { periods: 4, periodSeconds: 600, overtimeSeconds: 300 },
  });
  const id = state.games.at(-1).id;
  await command(
    'prepare',
    {
      roster: players.map((player: { id: string }) => player.id),
      lineup: players.slice(0, 5).map((player: { id: string }) => player.id),
    },
    id,
  );
  for (const [type, playerId] of [
    ['SHOT_3_MADE', players[0].id],
    ['SHOT_3_MADE', players[1].id],
    ['SHOT_3_MISSED', players[1].id],
    ['SHOT_3_MISSED', players[1].id],
  ])
    await command('event', { type, playerId, remaining: 500 }, id);
  await command('clock', { remaining: 0 }, id);
  await command('period', {}, id);
  await command('event', { type: 'SHOT_2_MISSED', playerId: players[0].id, remaining: 500 }, id);
  await command('event', { type: 'TURNOVER', playerId: players[0].id, remaining: 490 }, id);
  await command('event', { type: 'DEF_REBOUND', playerId: players[1].id, remaining: 480 }, id);
  await command('practice', {});
  return { id, players };
}

test('gráficas y comparador filtran tiros, métricas, cuartos y simulaciones con datos reales', async ({
  page,
}) => {
  const { id, players } = await chartFixture(page.request);
  await page.goto('/');
  await enterDefaultTeam(page);
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('button', { name: 'Estadísticas', exact: true })
    .click();
  const charts = page.locator('.analytics-section');
  await expect(charts.getByRole('heading', { name: 'Estadísticas en gráficas' })).toBeVisible();
  await charts.getByLabel('Partido de las gráficas').selectOption(id);
  await expect(charts.getByTestId('analytics-field-percent')).toHaveText('40%');
  await expect(charts.getByTestId('analytics-field-attempts')).toHaveText('2 / 5');
  await expect(charts.getByTestId('shot-zone-two')).toHaveAttribute('data-quality', 'low');
  await expect(charts.getByTestId('shot-zone-three')).toHaveAttribute('data-quality', 'good');
  await expect(charts.getByTestId('shot-zone-free')).toHaveAttribute('data-quality', 'empty');
  await charts.getByText('Ajustar objetivos', { exact: true }).click();
  await charts.getByLabel('Objetivo de triples', { exact: true }).fill('80');
  await expect(charts.getByTestId('shot-zone-three')).toHaveAttribute('data-quality', 'low');
  await charts.getByLabel('Objetivo de triples', { exact: true }).fill('35');
  await charts.getByText('Ajustar objetivos', { exact: true }).click();

  await charts.getByLabel('Periodo de las gráficas').selectOption('1');
  await expect(charts.getByTestId('analytics-field-percent')).toHaveText('50%');
  await charts.getByLabel('Jugador de las gráficas').selectOption(players[0].id);
  await expect(charts.getByTestId('analytics-field-percent')).toHaveText('100%');
  await charts.getByLabel('Jugador de las gráficas').selectOption(players[1].id);
  await expect(charts.getByTestId('analytics-field-percent')).toHaveText('33%');
  await expect(charts.getByTestId('shot-zone-three')).toHaveAttribute('data-quality', 'medium');
  await charts.getByLabel('Jugador de las gráficas').selectOption(players[0].id);
  await charts.getByLabel('Periodo de las gráficas').selectOption('2');
  await charts.getByLabel('Estadística a visualizar').selectOption('Val');
  await expect(charts.getByTestId(`analytics-bar-${players[0].id}`)).toContainText('-2');
  await expect(
    charts
      .getByRole('table', { name: 'Mapa de calor: Valoración', exact: true })
      .locator('tbody td'),
  ).toHaveText('-2');
  await expect(charts.getByText(/no se registran posiciones exactas/i)).toBeVisible();
  expect(
    await charts
      .getByLabel('Partido de las gráficas')
      .locator('option')
      .filter({ hasText: /^PRUEBA ·/ })
      .count(),
  ).toBe(0);
  await charts.getByLabel('Incluir simulaciones').check();
  expect(
    await charts
      .getByLabel('Partido de las gráficas')
      .locator('option')
      .filter({ hasText: /^PRUEBA ·/ })
      .count(),
  ).toBeGreaterThan(0);
  await charts.getByLabel('Incluir simulaciones').uncheck();
  await page.getByLabel('Desde', { exact: true }).fill('2027-01-01');
  await expect(charts.getByRole('status')).toContainText('No hay acciones registradas');
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Principal', exact: true })
    .getByRole('button', { name: 'Comparador', exact: true })
    .click();
  for (const player of players.slice(0, 2))
    await page.locator('.compare-picker button').filter({ hasText: player.name }).click();
  await expect(charts.getByRole('heading', { name: 'Comparador visual' })).toBeVisible();
  await charts.getByLabel('Partido de las gráficas').selectOption(id);
  await expect(charts.locator('.analytics-series-legend>span')).toHaveCount(2);
  const shooting = charts.getByRole('table', {
    name: 'Comparativa de tiro por jugador',
    exact: true,
  });
  await expect(
    shooting
      .locator('tbody tr')
      .filter({ hasText: players[0].name })
      .locator('[data-shot="3 puntos"]'),
  ).toContainText('100%');
  await expect(
    shooting
      .locator('tbody tr')
      .filter({ hasText: players[1].name })
      .locator('[data-shot="3 puntos"]'),
  ).toContainText('33%');
  await expect(charts.getByTestId(`analytics-bar-${players[0].id}`)).toContainText('3');
  await expect(charts.getByTestId(`analytics-bar-${players[1].id}`)).toContainText('3');
  await charts.getByLabel('Periodo de las gráficas').selectOption('2');
  await charts.getByLabel('Estadística a visualizar').selectOption('Val');
  await expect(charts.getByTestId(`analytics-bar-${players[0].id}`)).toContainText('-2');
  await expect(charts.getByTestId(`analytics-bar-${players[1].id}`)).toContainText('1');
  await expect(
    charts
      .getByRole('table', { name: 'Mapa de calor: Valoración', exact: true })
      .locator('tbody tr'),
  ).toHaveCount(2);
  await charts.getByLabel('Periodo de las gráficas').selectOption('ALL');
  await charts.getByLabel('Estadística a visualizar').selectOption('Pts');
  for (const width of [375, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await charts.screenshot({ path: 'docs/screenshots/analytics-comparator.png' });
});
