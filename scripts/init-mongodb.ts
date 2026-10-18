import { getDb, getMongoClient } from '../src/lib/mongodb';
import { initializeMongo } from '../src/server/mongo-indexes';
let client: Awaited<ReturnType<typeof getMongoClient>> | undefined;
try {
  client = await getMongoClient();
  const db = client.db(process.env.MONGODB_DB || 'basketball_stats');
  await initializeMongo(db);
  console.log('Colecciones e índices MongoDB preparados. No se han modificado datos existentes.');
} catch (error) {
  console.error(
    'No se han podido preparar los índices. Revisa la URI local, permisos y acceso de red.',
    (error as { code?: string }).code || 'CONFIGURATION_ERROR',
  );
  process.exitCode = 1;
} finally {
  await client?.close().catch(() => {});
}
