import type { Db } from 'mongodb';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { seedState } from '@/lib/seed';
import { newId, objectId } from '@/lib/ids';
import { getDb } from '@/lib/mongodb';
import { AppError, demoFile, readState } from './repository';
import { commitMongoState } from './mongo-repository';
import { z } from 'zod';
import type { AppState, Role } from '@/domain/basketball/types';
import type { MembershipDoc, SeasonDoc, TeamDoc } from './mongo-models';
import { demoDirectory } from './demo-path';
export interface CatalogEntry {
  teamId: string;
  seasonId: string;
  team: string;
  club: string;
  season: string;
  role: Role;
  category?: string;
  isSandbox?: boolean;
  deletedAt?: string;
}
const file = path.join(demoDirectory, 'catalog.json');
export async function demoCatalog(): Promise<CatalogEntry[]> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    const s = seedState();
    return [
      {
        teamId: s.teamId,
        seasonId: s.seasonId!,
        team: s.team,
        club: s.club,
        season: s.season,
        role: 'ADMIN',
      },
    ];
  }
}
export const catalogSchema = z
  .object({
    type: z.enum(['team', 'season', 'club']),
    name: z.string().trim().min(2).max(80),
    category: z.string().max(80),
    season: z.string().trim().min(2).max(50),
    startsAt: z.string().date(),
    endsAt: z.string().date(),
    clubName: z.string().max(100).optional(),
    carryRoster: z.boolean().default(false),
  })
  .refine((v) => v.endsAt > v.startsAt, 'La temporada debe terminar después de su inicio');
type Identity = {
  teamId: string;
  seasonId?: string;
  actor: string;
  role: Role;
  demo: boolean;
  userId: string;
};
export async function listCatalog(identity: Identity): Promise<CatalogEntry[]> {
  if (identity.demo) return demoCatalog();
  const db = await getDb(),
    memberships = await db
      .collection<MembershipDoc>('team_memberships')
      .find({ userId: objectId(identity.userId) })
      .toArray();
  const entries: CatalogEntry[] = [];
  for (const m of memberships) {
    const t = await db.collection<TeamDoc>('teams').findOne({ _id: m.teamId });
    if (!t) continue;
    if (t.isActive === false && m.role !== 'ADMIN') continue;
    const seasons = await db
      .collection<SeasonDoc>('seasons')
      .find({ teamId: t._id })
      .sort({ startDate: -1 })
      .toArray();
    for (const s of seasons)
      entries.push({
        teamId: t._id.toHexString(),
        seasonId: s._id.toHexString(),
        team: s.teamName || t.name,
        club: t.club,
        season: s.name,
        role: m.role,
        category: t.category,
        isSandbox: t.isSandbox,
        deletedAt:
          t.isActive === false
            ? t.deletedAt?.toISOString() || t.createdAt.toISOString()
            : undefined,
      });
  }
  return entries;
}

export async function setTeamDeleted(identity: Identity, deleted: boolean, database?: Db) {
  if (identity.role !== 'ADMIN')
    throw new AppError(403, 'Solo el administrador puede borrar o restaurar equipos');
  const operation = async () => {
    const now = new Date();
    if (identity.demo) {
      const entries = await demoCatalog();
      if (!entries.some((entry) => entry.teamId === identity.teamId))
        throw new AppError(404, 'Equipo no encontrado');
      const updated = entries.map((entry) =>
        entry.teamId === identity.teamId
          ? { ...entry, deletedAt: deleted ? now.toISOString() : undefined }
          : entry,
      );
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file + '.tmp', JSON.stringify(updated));
      await rename(file + '.tmp', file);
      return;
    }
    const db = database || (await getDb());
    const current = await db
      .collection<TeamDoc>('teams')
      .findOne({ _id: objectId(identity.teamId) });
    if (!current) throw new AppError(404, 'Equipo no encontrado');
    if ((current.isActive === false) === deleted) return;
    const result = await db
      .collection<TeamDoc>('teams')
      .updateOne(
        { _id: objectId(identity.teamId) },
        deleted
          ? { $set: { isActive: false, deletedAt: now, deletedBy: identity.userId } }
          : { $set: { isActive: true }, $unset: { deletedAt: '', deletedBy: '' } },
      );
    if (!result.matchedCount) throw new AppError(404, 'Equipo no encontrado');
    if (result.modifiedCount)
      await db
        .collection('audit_logs')
        .insertOne({
          teamId: objectId(identity.teamId),
          actorId: objectId(identity.userId),
          action: deleted ? 'team_deleted' : 'team_restored',
          detail: deleted
            ? 'Equipo enviado a la papelera; histórico conservado'
            : 'Equipo restaurado desde la papelera',
          createdAt: now,
        });
  };
  const task = queue.then(operation, operation);
  queue = task.catch(() => {});
  return task;
}
let queue: Promise<unknown> = Promise.resolve();
export async function createCatalog(
  identity: Identity,
  input: z.infer<typeof catalogSchema>,
): Promise<CatalogEntry> {
  if (identity.role !== 'ADMIN')
    throw new AppError(403, 'Solo el administrador puede crear equipos y temporadas');
  const operation = async () => {
    const previous = await readState(identity.teamId, identity.seasonId);
    const teamId = input.type === 'season' ? previous.teamId : newId(),
      seasonId = newId();
    const entry: CatalogEntry = {
      teamId,
      seasonId,
      team: input.type === 'season' ? previous.team : input.name,
      club:
        input.type === 'season'
          ? previous.club
          : input.clubName || (input.type === 'club' ? input.name : previous.club),
      category: input.category || previous.category,
      season: input.season,
      role: 'ADMIN',
    };
    const state: AppState = {
      ...entry,
      category: input.category || previous.category,
      version: 0,
      players:
        input.type === 'season' && input.carryRoster ? structuredClone(previous.players) : [],
      games: [],
      audit: [
        {
          id: newId(),
          actor: identity.actor,
          at: new Date().toISOString(),
          action: 'catalog',
          detail: 'Equipo y temporada creados',
        },
      ],
    };
    if (identity.demo) {
      const entries = await demoCatalog();
      if (entries.some((e) => e.teamId === teamId && e.season === input.season))
        throw new AppError(422, 'Ya existe esa temporada para el equipo');
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(demoFile(teamId, seasonId), JSON.stringify(state));
      await writeFile(file + '.tmp', JSON.stringify([...entries, entry]));
      await rename(file + '.tmp', file);
      return entry;
    }
    const db = await getDb(),
      now = new Date();
    // Provisioning is resumable. No transaction support is assumed on the Atlas tier.
    if (input.type !== 'season')
      await db.collection<TeamDoc>('teams').insertOne({
        _id: objectId(teamId),
        name: entry.team,
        club: entry.club,
        category: state.category,
        isActive: true,
        createdAt: now,
      });
    await db
      .collection<MembershipDoc>('team_memberships')
      .updateOne(
        { teamId: objectId(teamId), userId: objectId(identity.userId) },
        { $setOnInsert: { role: 'ADMIN' } },
        { upsert: true },
      );
    try {
      await db.collection<SeasonDoc>('seasons').insertOne({
        _id: objectId(seasonId),
        teamId: objectId(teamId),
        name: input.season,
        startDate: new Date(input.startsAt),
        endDate: new Date(input.endsAt),
        version: 0,
        createdAt: now,
      });
    } catch (e) {
      if ((e as { code?: number }).code === 11000)
        throw new AppError(422, 'Ya existe esa temporada para el equipo');
      throw e;
    }
    const before: AppState = { ...state, players: [], games: [], audit: [] };
    state.version = 1;
    await commitMongoState(before, state, db);
    return entry;
  };
  const task = queue.then(operation, operation);
  queue = task.catch(() => {});
  return task;
}
