import { expect, type Page } from '@playwright/test';
export async function enterDefaultTeam(page: Page) {
  await expect(page.getByRole('heading', { name: 'Elige tu equipo.' })).toBeVisible();
  const card = page.locator('[data-team-id="10000000-0000-4000-8000-000000000001"]');
  await card.getByRole('combobox').selectOption('40000000-0000-4000-8000-000000000001');
  await card.getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'El equipo, en perspectiva.' })).toBeVisible();
}
