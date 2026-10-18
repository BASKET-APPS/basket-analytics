import type { Db, IndexDescription } from 'mongodb';
export const mongoIndexes: Record<string, IndexDescription[]> = {
  teams: [{ key: { name: 1 } }],
  players: [{ key: { fullName: 1 } }],
  seasons: [{ key: { teamId: 1, name: 1 }, unique: true }, { key: { teamId: 1, startDate: -1 } }],
  roster_memberships: [
    { key: { seasonId: 1, playerId: 1 }, unique: true },
    {
      key: { seasonId: 1, jerseyNumber: 1 },
      unique: true,
      partialFilterExpression: { status: 'ACTIVE' },
    },
    { key: { teamId: 1, seasonId: 1 } },
  ],
  matches: [
    { key: { seasonId: 1, startsAt: -1 } },
    { key: { teamId: 1, venueType: 1, startsAt: -1 } },
  ],
  match_events: [
    { key: { matchId: 1, clientEventId: 1 }, unique: true },
    { key: { matchId: 1, sequence: 1 }, unique: true },
    { key: { matchId: 1, period: 1, elapsedMs: 1 } },
  ],
  player_stints: [{ key: { matchId: 1, playerId: 1, startElapsedMs: 1 }, unique: true }],
  match_lineups: [{ key: { matchId: 1, startElapsedMs: 1, sequence: 1 }, unique: true }],
  player_match_stats: [{ key: { matchId: 1, playerId: 1 }, unique: true }],
  team_match_stats: [{ key: { matchId: 1, teamId: 1 }, unique: true }],
  users: [{ key: { email: 1 }, unique: true }],
  team_memberships: [{ key: { teamId: 1, userId: 1 }, unique: true }],
  audit_logs: [{ key: { entityType: 1, entityId: 1, createdAt: -1 } }],
  sessions: [
    { key: { token: 1 }, unique: true },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ],
  accounts: [{ key: { providerId: 1, accountId: 1 }, unique: true }],
  verifications: [{ key: { expiresAt: 1 }, expireAfterSeconds: 0 }],
};
export async function initializeMongo(db: Db) {
  for (const [name, indexes] of Object.entries(mongoIndexes)) {
    if (!(await db.listCollections({ name }).hasNext())) await db.createCollection(name);
    await db.collection(name).createIndexes(indexes);
  }
}
