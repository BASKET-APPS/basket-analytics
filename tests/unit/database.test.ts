import { addShowcaseGames } from '@/server/showcase';
import { SHOWCASE_COMPETITION } from '@/domain/basketball/types';
import { setTeamDeleted } from '@/server/catalog';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { initializeMongo } from '@/server/mongo-indexes';
import { readMongoState, commitMongoState, reconcileSeason } from '@/server/mongo-repository';
import { applyCommand, type Command } from '@/server/service';
import type { SeasonDoc } from '@/server/mongo-models';
import type { AppState } from '@/domain/basketball/types';
import { reduceGameEvents } from '@/domain/basketball/stats';
let server: MongoMemoryServer, client: MongoClient;
const teamId = new ObjectId(),
  seasonId = new ObjectId();
const database = () => client.db('basket_test');
let saved: AppState;
async function change(action: Command['action'], payload: Command['payload'], gameId?: string) {
  const before = structuredClone(saved),
    after = structuredClone(saved);
  applyCommand(
    after,
    { action, payload, gameId, version: before.version, mutationId: crypto.randomUUID() },
    'Test',
    'ADMIN',
  );
  after.version++;
  await commitMongoState(before, after, database());
  saved = await readMongoState(teamId.toHexString(), seasonId.toHexString(), database());
  return saved;
}
describe('MongoDB real aislado, sin transacciones multidocumento', () => {
  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    client = await new MongoClient(server.getUri()).connect();
    const db = database();
    await initializeMongo(db);
    await db.collection('teams').insertOne({
      _id: teamId,
      name: 'CDIR Test',
      club: 'CDIR',
      category: 'Sénior',
      isActive: true,
      createdAt: new Date(),
    });
    await db.collection('seasons').insertOne({
      _id: seasonId,
      teamId,
      name: '26/27',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-07-01'),
      version: 0,
      createdAt: new Date(),
    });
    saved = await readMongoState(teamId.toHexString(), seasonId.toHexString(), db);
  }, 120000);
  afterAll(async () => {
    await client?.close();
    await server?.stop();
  });
  it('inicializar dos veces conserva datos e índices', async () => {
    await initializeMongo(database());
    expect(await database().collection('teams').countDocuments()).toBe(1);
    expect(
      (await database().collection('match_events').indexes()).filter((i) => i.unique).length,
    ).toBe(2);
  });
  it('guarda BSON ObjectId, fechas UTC y las inscripciones con dorsal único', async () => {
    for (let i = 0; i < 6; i++)
      await change('player', { name: 'Jugador ' + i, number: i + 1, position: 'Base' });
    expect(saved.players.length).toBe(6);
    const p = await database().collection('players').findOne({});
    expect(p?._id).toBeInstanceOf(ObjectId);
    const roster = await database().collection('roster_memberships').findOne({});
    await expect(
      database()
        .collection('roster_memberships')
        .insertOne({ ...roster!, _id: new ObjectId(), playerId: new ObjectId() }),
    ).rejects.toMatchObject({ code: 11000 });
  });
  it('persistencia de eventos, quintetos, minutos, marcador y proyecciones', async () => {
    await change('game', {
      opponent: 'Rival',
      date: '2026-10-18T10:00:00.000Z',
      timezone: 'Europe/Madrid',
      venue: 'HOME',
      competition: 'Liga',
      rules: { periods: 4, periodSeconds: 600, overtimeSeconds: 300 },
    });
    const g = saved.games.at(-1)!;
    await change(
      'prepare',
      {
        roster: saved.players.map((p) => p.id),
        lineup: saved.players.slice(0, 5).map((p) => p.id),
      },
      g.id,
    );
    await change(
      'event',
      { type: 'SHOT_3_MADE', playerId: saved.players[0].id, remaining: 590 },
      g.id,
    );
    await change('event', { type: 'OPPONENT_SCORE', points: 2, remaining: 585 }, g.id);
    const result = reduceGameEvents(saved.games[0]);
    expect(result.ours).toBe(3);
    expect(result.opponent).toBe(2);
    expect(result.stats[saved.players[0].id]['+/-']).toBe(1);
    const shot = await database().collection('match_events').findOne({ type: 'SHOT_3_MADE' });
    expect(shot?.onCourtPlayerIds).toHaveLength(5);
    expect(shot?.onCourtPlayerIds[0]).toBeInstanceOf(ObjectId);
    expect(shot?.createdAt).toBeInstanceOf(Date);
    expect(
      await database()
        .collection('player_stints')
        .countDocuments({ obsolete: { $ne: true } }),
    ).toBe(5);
    expect(await database().collection('player_match_stats').countDocuments()).toBe(6);
  });
  it('una anulación sobrevive a la recarga y recalcula estadísticas', async () => {
    const g = saved.games[0];
    await change(
      'undo',
      { reason: 'Corrección de tiro', eventId: g.events.find((e) => e.type === 'SHOT_3_MADE')!.id },
      g.id,
    );
    const reloaded = await readMongoState(teamId.toHexString(), seasonId.toHexString(), database());
    expect(reduceGameEvents(reloaded.games[0]).ours).toBe(0);
    expect(
      await database()
        .collection('match_events')
        .countDocuments({ voidedAt: { $ne: null } }),
    ).toBe(1);
  });
  it('rechaza dos escritores con la misma versión y no pierde el primer evento', async () => {
    const before = structuredClone(saved),
      first = structuredClone(saved),
      second = structuredClone(saved);
    first.version++;
    second.version++;
    first.team = 'Cambio uno';
    second.team = 'Cambio dos';
    const results = await Promise.allSettled([
      commitMongoState(before, first, database()),
      commitMongoState(before, second, database()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    saved = await readMongoState(teamId.toHexString(), seasonId.toHexString(), database());
  });
  it('recupera una escritura interrumpida y repetir la recuperación no duplica eventos', async () => {
    const season = await database().collection<SeasonDoc>('seasons').findOne({ _id: seasonId });
    const intent = {
      token: crypto.randomUUID(),
      version: saved.version + 1,
      createdAt: new Date(),
      players: [],
      games: [saved.games[0]],
      audit: [],
      metadata: { team: saved.team, category: saved.category },
    };
    await database()
      .collection('seasons')
      .updateOne({ _id: seasonId }, { $set: { pending: intent } });
    const old = { ...season!, pending: intent };
    const n = await database().collection('match_events').countDocuments();
    await reconcileSeason(database(), old);
    await reconcileSeason(database(), old);
    expect(await database().collection('match_events').countDocuments()).toBe(n);
    expect(
      (await database().collection('seasons').findOne({ _id: seasonId }))?.pending,
    ).toBeUndefined();
  });
  it('un equipo ajeno no puede leer una temporada existente', async () => {
    await expect(
      readMongoState(new ObjectId().toHexString(), seasonId.toHexString(), database()),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('borrado recuperable en MongoDB conserva el histórico y exige administrador', async () => {
    const db = database();
    const identity = {
      teamId: teamId.toHexString(),
      seasonId: seasonId.toHexString(),
      actor: 'Test',
      userId: new ObjectId().toHexString(),
      role: 'ADMIN' as const,
      demo: false,
    };
    const before = {
      players: await db.collection('players').countDocuments(),
      games: await db.collection('matches').countDocuments(),
      seasons: await db.collection('seasons').countDocuments(),
      events: await db.collection('match_events').countDocuments(),
    };
    await expect(setTeamDeleted({ ...identity, role: 'COACH' }, true, db)).rejects.toMatchObject({
      status: 403,
    });
    await setTeamDeleted(identity, true, db);
    const deleted = await db.collection('teams').findOne({ _id: teamId });
    expect(deleted?.isActive).toBe(false);
    expect(deleted?.deletedAt).toBeInstanceOf(Date);
    await setTeamDeleted(identity, true, db);
    expect(
      await db.collection('audit_logs').countDocuments({ teamId, action: 'team_deleted' }),
    ).toBe(1);
    await setTeamDeleted(identity, false, db);
    const restored = await db.collection('teams').findOne({ _id: teamId });
    expect(restored?.isActive).toBe(true);
    expect(restored?.deletedAt).toBeUndefined();
    expect({
      players: await db.collection('players').countDocuments(),
      games: await db.collection('matches').countDocuments(),
      seasons: await db.collection('seasons').countDocuments(),
      events: await db.collection('match_events').countDocuments(),
    }).toEqual(before);
  });

  it('guarda en MongoDB la demo completa con eventos, resultados y estadísticas derivadas', async () => {
    const db = database();
    await db.collection('teams').updateOne({ _id: teamId }, { $set: { isSandbox: true } });
    const before = await readMongoState(teamId.toHexString(), seasonId.toHexString(), db);
    const after = structuredClone(before);
    expect(addShowcaseGames(after, 'Demo')).toBe(8);
    after.version++;
    await commitMongoState(before, after, db);
    const persisted = await readMongoState(teamId.toHexString(), seasonId.toHexString(), db);
    const examples = persisted.games.filter((game) => game.competition === SHOWCASE_COMPETITION);
    expect(examples).toHaveLength(8);
    for (const game of examples.filter((game) => game.status === 'FINAL')) {
      const projection = reduceGameEvents(game);
      const stored = await db.collection('matches').findOne({ _id: new ObjectId(game.id) });
      expect(stored?.scoreFor).toBe(projection.ours);
      expect(stored?.scoreAgainst).toBe(projection.opponent);
      expect(
        await db
          .collection('player_match_stats')
          .countDocuments({ matchId: new ObjectId(game.id) }),
      ).toBe(game.roster.length);
      expect(game.isPractice).toBe(true);
    }
  });
});
