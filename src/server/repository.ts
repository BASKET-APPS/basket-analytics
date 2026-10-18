import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { isDemo } from '@/lib/auth';
import { seedState } from '@/lib/seed';
import type { AppState } from '@/domain/basketball/types';
import { demoDirectory } from './demo-path';
import { AppError } from './errors';
import { readMongoState, commitMongoState } from './mongo-repository';
export { AppError } from './errors';
export const demoFile = (teamId: string, seasonId?: string) =>
  path.join(
    demoDirectory,
    teamId === '10000000-0000-4000-8000-000000000001' &&
      (!seasonId || seasonId === '40000000-0000-4000-8000-000000000001')
      ? 'demo.json'
      : `${teamId}-${seasonId}.json`,
  );
let queue: Promise<unknown> = Promise.resolve();
export async function readState(teamId: string, seasonId?: string): Promise<AppState> {
  if (!isDemo()) return readMongoState(teamId, seasonId);
  try {
    return JSON.parse(await readFile(demoFile(teamId, seasonId), 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    const seed = seedState();
    if (teamId !== seed.teamId || (seasonId && seasonId !== seed.seasonId))
      throw new AppError(404, 'Equipo o temporada no disponible');
    return seed;
  }
}
export async function mutateState(
  teamId: string,
  version: number,
  fn: (s: AppState) => void,
  seasonId?: string,
  idempotence?: { gameId?: string; mutationId: string },
): Promise<AppState> {
  const operation = async () => {
    const state = await readState(teamId, seasonId);
    if (
      idempotence &&
      (state.audit.some((a) => a.mutationId === idempotence.mutationId) ||
        state.games.some(
          (g) =>
            (!idempotence.gameId || g.id === idempotence.gameId) &&
            g.events.some((e) => e.mutationId === idempotence.mutationId),
        ))
    )
      return state;
    if (state.version !== version)
      throw new AppError(
        409,
        'Otro dispositivo ha actualizado el partido. Revisa los datos y reintenta.',
      );
    const before = structuredClone(state);
    fn(state);
    state.version++;
    if (isDemo()) {
      const file = demoFile(teamId, seasonId);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file + '.tmp', JSON.stringify(state));
      await rename(file + '.tmp', file);
    } else await commitMongoState(before, state);
    return state;
  };
  const promise = queue.then(operation, operation);
  queue = promise.catch(() => {});
  return promise;
}
