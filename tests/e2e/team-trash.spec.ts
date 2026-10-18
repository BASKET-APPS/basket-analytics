import { test, expect } from '@playwright/test';

test('borrar un equipo pide confirmación, lo oculta y permite restaurar todas sus temporadas', async ({
  page,
}) => {
  const origin = { origin: 'http://127.0.0.1:3002' };
  const name = `Equipo papelera ${Date.now()}`;
  const created = await page.request.post('/api/catalog', {
    headers: origin,
    data: {
      type: 'team',
      name,
      clubName: 'Club pruebas',
      category: 'Infantil',
      season: '2026 / 2027',
      startsAt: '2026-09-01',
      endsAt: '2027-07-31',
    },
  });
  expect(created.ok()).toBe(true);
  const team = (await created.json()).entry;
  const workspace = `/api/workspace?teamId=${team.teamId}&seasonId=${team.seasonId}`;
  const state = (await (await page.request.get(workspace)).json()).state;
  expect(
    (
      await page.request.post(workspace, {
        headers: origin,
        data: {
          action: 'player',
          version: state.version,
          mutationId: crypto.randomUUID(),
          payload: { name: 'Jugador conservado', number: 8, position: 'Base', active: true },
        },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post(`/api/catalog?teamId=${team.teamId}&seasonId=${team.seasonId}`, {
        headers: origin,
        data: {
          type: 'season',
          name,
          category: 'Infantil',
          season: '2027 / 2028',
          startsAt: '2027-09-01',
          endsAt: '2028-07-31',
          carryRoster: true,
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Gestionar equipos', exact: true }).click();
  const card = page.locator(`[data-team-id="${team.teamId}"]`);
  await card.getByRole('button', { name: `Seleccionar equipo ${name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Borrar equipo', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(name);
  await expect(dialog).toContainText('todas sus temporadas');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Borrar equipo', exact: true }).click();
  await dialog.getByRole('button', { name: 'Mover a la papelera', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(card).not.toBeVisible();
  expect((await page.request.get(workspace)).status()).toBe(410);
  const entries = (await (await page.request.get('/api/catalog')).json()).entries.filter(
    (entry: { teamId: string }) => entry.teamId === team.teamId,
  );
  expect(entries).toHaveLength(2);
  expect(entries.every((entry: { deletedAt?: string }) => entry.deletedAt)).toBe(true);
  await page.reload();
  await expect(card).not.toBeVisible();
  await page.getByRole('button', { name: /^Papelera/ }).click();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Restaurar equipo', exact: true }).click();
  await expect(card).not.toBeVisible();
  const restored = await page.request.get(workspace);
  expect(restored.ok()).toBe(true);
  expect((await restored.json()).state.players[0].name).toBe('Jugador conservado');
  await page.getByRole('button', { name: 'Equipos', exact: true }).click();
  await expect(card).toBeVisible();
  expect(
    (
      await page.request.delete(`/api/catalog?teamId=${team.teamId}`, {
        headers: { origin: 'https://foreign.invalid' },
      })
    ).status(),
  ).toBe(403);
  expect((await page.request.get(workspace)).ok()).toBe(true);
});
