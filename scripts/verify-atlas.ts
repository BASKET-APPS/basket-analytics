import { ObjectId } from 'mongodb';
import { getMongoClient } from '../src/lib/mongodb';
let client: Awaited<ReturnType<typeof getMongoClient>> | undefined;
try {
  client = await getMongoClient();
  const db = client.db(process.env.MONGODB_DB || 'basketball_stats');
  await db.command({ ping: 1 });
  const teamId = new ObjectId('650000000000000000000003');
  const match = await db
    .collection('matches')
    .findOne({ teamId, isPractice: true }, { sort: { startsAt: -1 } });
  console.log(
    JSON.stringify(
      {
        connected: true,
        database: db.databaseName,
        collections: (await db.listCollections().toArray()).map((c) => c.name).sort(),
        sandboxPlayers: await db.collection('roster_memberships').countDocuments({ teamId }),
        practiceScore: match
          ? { for: match.scoreFor, against: match.scoreAgainst, version: match.version }
          : null,
        practiceEvents: await db.collection('match_events').countDocuments({ teamId }),
        officialTeamMatches: await db
          .collection('matches')
          .countDocuments({ teamId: new ObjectId('650000000000000000000001') }),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    'No se ha podido verificar Atlas',
    (error as { code?: number }).code || 'CONNECTION_ERROR',
  );
  process.exitCode = 1;
} finally {
  await client?.close();
}
