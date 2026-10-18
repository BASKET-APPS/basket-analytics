import 'server-only';
import { BSON, ObjectId, type Db, type Document, type AnyBulkWriteOperation } from 'mongodb';
import { createHash } from 'node:crypto';
import { getDb } from '@/lib/mongodb';
import { objectId } from '@/lib/ids';
import { reduceGameEvents, teamStats } from '@/domain/basketball/stats';
import type { AppState, Game, GameEvent } from '@/domain/basketball/types';
import type {
  TeamDoc,
  SeasonDoc,
  RosterDoc,
  MatchDoc,
  EventDoc,
  WriteIntent,
} from './mongo-models';
import { AppError } from './errors';

const derivedId = (...parts: string[]) =>
  new ObjectId(createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 24));
const eventId = (id: string) => (/^[a-f\d]{24}$/i.test(id) ? objectId(id) : derivedId('event', id));
// A conditional single-document update keeps retries and late recovery monotonic.
function versionedOperation(
  id: ObjectId,
  value: Document,
  version: number,
): AnyBulkWriteOperation<Document> {
  return {
    updateOne: {
      filter: { _id: id },
      update: [
        {
          $replaceWith: {
            $cond: [
              { $gt: [{ $ifNull: ['$sourceVersion', -1] }, version] },
              '$$ROOT',
              {
                $mergeObjects: [
                  '$$ROOT',
                  { $literal: { ...value, _id: id, sourceVersion: version } },
                ],
              },
            ],
          },
        },
      ],
      upsert: true,
    },
  };
}
async function putMany(
  db: Db,
  name: string,
  values: { id: ObjectId; value: Document }[],
  version: number,
) {
  if (values.length)
    await db.collection(name).bulkWrite(
      values.map((v) => versionedOperation(v.id, v.value, version)),
      { ordered: true },
    );
}
async function putVersioned(db: Db, name: string, id: ObjectId, value: Document, version: number) {
  await putMany(db, name, [{ id, value }], version);
}
function eventDocument(
  e: GameEvent,
  g: Game,
  teamId: ObjectId,
  seasonId: ObjectId,
  lineup: string[],
  version: number,
): EventDoc {
  return {
    _id: eventId(e.id),
    matchId: objectId(g.id),
    teamId,
    seasonId,
    clientEventId: e.mutationId,
    sequence: e.sequence,
    period: e.period,
    elapsedMs: e.elapsed * 1000,
    remainingSeconds: e.remaining,
    side: e.type === 'OPPONENT_SCORE' ? 'AGAINST' : 'FOR',
    ...(e.playerId ? { playerId: objectId(e.playerId) } : {}),
    type: e.type,
    points:
      e.type === 'SHOT_2_MADE'
        ? 2
        : e.type === 'SHOT_3_MADE'
          ? 3
          : e.type === 'FREE_THROW_MADE'
            ? 1
            : e.points,
    lineupPlayerIds: e.lineup?.map(objectId),
    onCourtPlayerIds: (e.onCourtPlayerIds || lineup).map(objectId),
    voidedAt: e.voided ? new Date(e.createdAt) : null,
    reason: e.reason,
    createdBy: e.createdBy,
    createdAt: new Date(e.createdAt),
    sourceVersion: version,
  };
}
export async function reconcileSeason(db: Db, season: SeasonDoc) {
  const intent = season.pending;
  if (!intent) return;
  const teamId = season.teamId,
    seasonId = season._id,
    version = intent.version;
  for (const p of intent.players) {
    if (p.photo?.startsWith('data:'))
      throw new AppError(
        422,
        'Las fotos de MongoDB deben ser URLs de almacenamiento externo, no archivos binarios',
      );
    const playerId = objectId(p.id);
    await db.collection('players').updateOne(
      { _id: playerId },
      {
        $setOnInsert: {
          fullName: p.name,
          position: p.position,
          photoUrl: p.photo,
          createdAt: intent.createdAt,
        },
      },
      { upsert: true },
    );
    await putVersioned(
      db,
      'roster_memberships',
      derivedId(seasonId.toHexString(), p.id),
      {
        teamId,
        seasonId,
        playerId,
        jerseyNumber: p.number,
        status: p.active ? 'ACTIVE' : 'ARCHIVED',
        displayName: p.name,
        position: p.position,
        photoUrl: p.photo,
        activeFrom: season.startDate,
        activeTo: p.active ? null : intent.createdAt,
      },
      version,
    );
  }
  for (const g of intent.games) {
    const matchId = objectId(g.id),
      projection = reduceGameEvents(g);
    let lineup: string[] = [];
    const changedEvents: { id: ObjectId; value: Document }[] = [];
    for (const e of [...g.events].sort((a, b) => a.sequence - b.sequence)) {
      if (!intent.changedEventIds || intent.changedEventIds.includes(e.id)) {
        const doc = eventDocument(e, g, teamId, seasonId, lineup, version);
        changedEvents.push({ id: doc._id, value: doc });
      }
      if (!e.voided && e.lineup) lineup = e.lineup;
    }
    await putMany(db, 'match_events', changedEvents, version);
    const valid = g.events
      .filter((e) => !e.voided && (e.type === 'LINEUP_SET' || e.type === 'SUBSTITUTION'))
      .sort((a, b) => a.elapsed - b.elapsed || a.sequence - b.sequence);
    const stints: { id: ObjectId; value: Document }[] = [],
      lineups: { id: ObjectId; value: Document }[] = [];
    for (let i = 0; i < valid.length; i++) {
      const e = valid[i],
        end = valid[i + 1]?.elapsed ?? g.elapsed;
      lineups.push({
        id: derivedId(g.id, 'lineup', e.id),
        value: {
          matchId,
          teamId,
          seasonId,
          playerIds: e.lineup!.map(objectId),
          sequence: e.sequence,
          startElapsedMs: e.elapsed * 1000,
          endElapsedMs: end * 1000,
          obsolete: false,
        },
      });
      if (end > e.elapsed)
        for (const id of e.lineup!)
          stints.push({
            id: derivedId(g.id, id, e.id),
            value: {
              matchId,
              teamId,
              seasonId,
              playerId: objectId(id),
              startElapsedMs: e.elapsed * 1000,
              endElapsedMs: end * 1000,
              startPeriod: e.period,
              endPeriod: valid[i + 1]?.period ?? g.period,
              obsolete: false,
            },
          });
    }
    await putMany(db, 'match_lineups', lineups, version);
    await putMany(db, 'player_stints', stints, version);
    for (const [name, values] of [
      ['player_stints', stints],
      ['match_lineups', lineups],
    ] as const)
      await db
        .collection(name)
        .updateMany(
          { matchId, _id: { $nin: values.map((v) => v.id) }, sourceVersion: { $lte: version } },
          { $set: { obsolete: true, sourceVersion: version } },
        );
    await putMany(
      db,
      'player_match_stats',
      Object.entries(projection.stats).map(([id, stats]) => ({
        id: derivedId(g.id, 'stats', id),
        value: {
          matchId,
          teamId,
          seasonId,
          playerId: objectId(id),
          stats,
          plusMinus: stats['+/-'],
          valuation: stats.Val,
          computedAt: intent.createdAt,
          isPractice: !!g.isPractice,
        },
      })),
      version,
    );
    await putVersioned(
      db,
      'team_match_stats',
      derivedId(g.id, 'team-stats'),
      {
        matchId,
        teamId,
        seasonId,
        stats: teamStats([g]),
        computedAt: intent.createdAt,
        isPractice: !!g.isPractice,
      },
      version,
    );
    await putVersioned(
      db,
      'matches',
      matchId,
      {
        teamId,
        seasonId,
        opponentName: g.opponent,
        startsAt: new Date(g.date),
        timezone: g.timezone,
        venueType: g.venue,
        status: g.status,
        competition: g.competition,
        rosterPlayerIds: g.roster.map(objectId),
        rules: g.rules,
        period: g.period,
        clockSecondsRemaining: g.remaining,
        elapsedSeconds: g.elapsed,
        version: g.version,
        isPractice: !!g.isPractice,
        scoreFor: projection.ours,
        scoreAgainst: projection.opponent,
        lineupPlayerIds: projection.lineup.map(objectId),
        updatedAt: intent.createdAt,
      },
      version,
    );
  }
  for (const a of intent.audit)
    await db.collection('audit_logs').updateOne(
      { _id: eventId(a.id) },
      {
        $setOnInsert: {
          teamId,
          seasonId,
          actorUserId: a.actorId && /^[a-f\d]{24}$/i.test(a.actorId) ? objectId(a.actorId) : null,
          actorName: a.actor,
          clientMutationId: a.mutationId,
          entityType: 'season',
          entityId: seasonId,
          action: a.action,
          detail: a.detail,
          createdAt: new Date(a.at),
        },
      },
      { upsert: true },
    );
  await db.collection<SeasonDoc>('seasons').updateOne(
    { _id: seasonId, 'pending.token': intent.token },
    {
      $set: {
        version,
        teamName: intent.metadata.team,
        category: intent.metadata.category,
        updatedAt: intent.createdAt,
      },
      $unset: { pending: '' },
    },
  );
}
function gameDto(g: MatchDoc, events: EventDoc[]): Game {
  return {
    id: g._id.toHexString(),
    opponent: g.opponentName,
    date: g.startsAt.toISOString(),
    timezone: g.timezone,
    venue: g.venueType,
    status: g.status,
    competition: g.competition,
    roster: g.rosterPlayerIds.map((id) => id.toHexString()),
    rules: g.rules,
    period: g.period,
    remaining: g.clockSecondsRemaining,
    elapsed: g.elapsedSeconds,
    version: g.version,
    isPractice: g.isPractice,
    events: events.map((e) => ({
      id: e._id.toHexString(),
      mutationId: e.clientEventId,
      sequence: e.sequence,
      type: e.type,
      playerId: e.playerId?.toHexString(),
      points: e.points,
      lineup: e.lineupPlayerIds?.map((id) => id.toHexString()),
      onCourtPlayerIds: e.onCourtPlayerIds.map((id) => id.toHexString()),
      period: e.period,
      remaining: e.remainingSeconds,
      elapsed: e.elapsedMs / 1000,
      voided: !!e.voidedAt,
      reason: e.reason,
      createdBy: e.createdBy,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
export async function readMongoState(
  team: string,
  seasonId?: string,
  dbOverride?: Db,
): Promise<AppState> {
  const db = dbOverride || (await getDb()),
    teamId = objectId(team);
  for (let attempt = 0; attempt < 4; attempt++) {
    let season = await db
      .collection<SeasonDoc>('seasons')
      .findOne(
        { teamId, ...(seasonId ? { _id: objectId(seasonId) } : {}) },
        { sort: { startDate: -1 } },
      );
    if (!season) throw new AppError(404, 'Equipo o temporada no disponible');
    if (season.pending) {
      await reconcileSeason(db, season);
      continue;
    }
    const [teamDoc, roster, games, audit] = await Promise.all([
      db.collection<TeamDoc>('teams').findOne({ _id: teamId }),
      db
        .collection<RosterDoc>('roster_memberships')
        .find({ teamId, seasonId: season._id })
        .toArray(),
      db
        .collection<MatchDoc>('matches')
        .find({ teamId, seasonId: season._id })
        .sort({ startsAt: 1 })
        .toArray(),
      db
        .collection('audit_logs')
        .find({ teamId, seasonId: season._id })
        .sort({ createdAt: 1 })
        .toArray(),
    ]);
    if (!teamDoc) throw new AppError(404, 'Equipo no encontrado');
    const events = await db
      .collection<EventDoc>('match_events')
      .find({ teamId, seasonId: season._id })
      .sort({ sequence: 1 })
      .toArray();
    const after = await db
      .collection<SeasonDoc>('seasons')
      .findOne({ _id: season._id }, { projection: { version: 1, pending: 1 } });
    if (after?.pending || after?.version !== season.version) continue;
    return {
      teamId: team,
      isSandbox: teamDoc.isSandbox || false,
      seasonId: season._id.toHexString(),
      team: season.teamName || teamDoc.name,
      category: season.category || teamDoc.category,
      club: teamDoc.club,
      season: season.name,
      version: season.version,
      players: roster.map((r) => ({
        id: r.playerId.toHexString(),
        name: r.displayName,
        number: r.jerseyNumber,
        position: r.position,
        photo: r.photoUrl,
        active: r.status === 'ACTIVE',
      })),
      games: games.map((g) =>
        gameDto(
          g,
          events.filter((e) => e.matchId.equals(g._id)),
        ),
      ),
      audit: audit.map((a) => ({
        id: a._id.toHexString(),
        at: a.createdAt.toISOString(),
        actor: a.actorName,
        actorId: a.actorUserId?.toHexString(),
        mutationId: a.clientMutationId,
        action: a.action,
        detail: a.detail,
      })),
    };
  }
  throw new AppError(409, 'El equipo está sincronizando cambios. Actualiza e inténtalo de nuevo.');
}
export async function commitMongoState(before: AppState, after: AppState, dbOverride?: Db) {
  const db = dbOverride || (await getDb());
  const seasonId = objectId(after.seasonId!),
    teamId = objectId(after.teamId);
  const intent: WriteIntent = {
    token: crypto.randomUUID(),
    version: after.version,
    createdAt: new Date(),
    players: after.players.filter(
      (p) => JSON.stringify(p) !== JSON.stringify(before.players.find((x) => x.id === p.id)),
    ),
    games: after.games.filter(
      (g) => g.version !== before.games.find((x) => x.id === g.id)?.version,
    ),
    audit: after.audit.slice(before.audit.length),
    metadata: { team: after.team, category: after.category },
    changedEventIds: after.games.flatMap((g) =>
      g.events
        .filter(
          (e) =>
            JSON.stringify(e) !==
            JSON.stringify(
              before.games.find((x) => x.id === g.id)?.events.find((x) => x.id === e.id),
            ),
        )
        .map((e) => e.id),
    ),
  };
  if (intent.players.some((p) => p.photo?.startsWith('data:')))
    throw new AppError(
      422,
      'Configura el almacenamiento de fotografías: MongoDB solo guarda sus URLs',
    );
  if (BSON.calculateObjectSize(intent) > 8_000_000)
    throw new AppError(
      413,
      'El partido requiere archivado/paginación antes de seguir añadiendo eventos',
    );
  const locked = await db
    .collection<SeasonDoc>('seasons')
    .findOneAndUpdate(
      { _id: seasonId, teamId, version: before.version, pending: { $exists: false } },
      { $set: { pending: intent } },
      { returnDocument: 'after' },
    );
  if (!locked)
    throw new AppError(409, 'Otro dispositivo ha actualizado este equipo. Revisa y reintenta.');
  await reconcileSeason(db, locked);
}
