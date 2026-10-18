import { ObjectId } from 'mongodb';
import { getDb, getMongoClient } from '../src/lib/mongodb';
import { initializeMongo } from '../src/server/mongo-indexes';
import { readMongoState, commitMongoState } from '../src/server/mongo-repository';
import { applyCommand } from '../src/server/service';
let client: Awaited<ReturnType<typeof getMongoClient>> | undefined;
try {
  client = await getMongoClient();
  const db = client.db(process.env.MONGODB_DB || 'basketball_stats');
  await initializeMongo(db);
  const now = new Date(),
    teamId = new ObjectId('650000000000000000000001'),
    seasonId = new ObjectId('650000000000000000000002');
  await db.collection('teams').updateOne(
    { _id: teamId },
    {
      $setOnInsert: {
        name: 'CDI Rozasbasket',
        shortName: 'CDIR',
        club: 'CDI Rozasbasket',
        category: 'Sénior',
        logoUrl: '/club/logo.png',
        isActive: true,
        createdAt: now,
      },
    },
    { upsert: true },
  );
  await db.collection('seasons').updateOne(
    { _id: seasonId },
    {
      $setOnInsert: {
        teamId,
        name: '2026 / 2027',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-07-01'),
        version: 0,
        status: 'ACTIVE',
        periods: 4,
        periodDurationSeconds: 600,
        overtimeDurationSeconds: 300,
        createdAt: now,
      },
    },
    { upsert: true },
  );
  if (process.env.ADMIN_EMAIL) {
    const user = await db
      .collection('users')
      .findOne({ email: process.env.ADMIN_EMAIL.trim().toLowerCase() });
    if (!user) throw Error('ADMIN_NOT_REGISTERED');
    await db
      .collection('team_memberships')
      .updateOne(
        { teamId, userId: user._id },
        { $set: { role: 'ADMIN' }, $setOnInsert: { createdAt: now } },
        { upsert: true },
      );
  }
  if (process.env.LOCAL_MONGO_MODE === 'true') {
    const adminId = new ObjectId('650000000000000000000005');
    await db
      .collection('users')
      .updateOne(
        { _id: adminId },
        {
          $setOnInsert: {
            authProviderId: 'local-development-admin',
            name: 'Administrador local',
            email: 'local@basket.invalid',
            emailVerified: false,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true },
      );
    const sandboxTeam = new ObjectId('650000000000000000000003'),
      sandboxSeason = new ObjectId('650000000000000000000004');
    await db
      .collection('teams')
      .updateOne(
        { _id: sandboxTeam },
        {
          $setOnInsert: {
            name: 'CDIR · Pruebas',
            shortName: 'PRUEBAS',
            club: 'Laboratorio de pruebas',
            category: 'Practica con datos de ejemplo',
            isSandbox: true,
            isActive: true,
            createdAt: now,
          },
        },
        { upsert: true },
      );
    await db
      .collection('seasons')
      .updateOne(
        { _id: sandboxSeason },
        {
          $setOnInsert: {
            teamId: sandboxTeam,
            name: 'Laboratorio 2026 / 2027',
            startDate: new Date('2026-09-01'),
            endDate: new Date('2027-07-01'),
            version: 0,
            createdAt: now,
          },
        },
        { upsert: true },
      );
    for (const id of [teamId, sandboxTeam])
      await db
        .collection('team_memberships')
        .updateOne(
          { teamId: id, userId: adminId },
          { $setOnInsert: { role: 'ADMIN', createdAt: now } },
          { upsert: true },
        );
    let state = await readMongoState(sandboxTeam.toHexString(), sandboxSeason.toHexString(), db);
    if (state.players.length === 0) {
      const before = structuredClone(state);
      for (let i = 0; i < 12; i++)
        applyCommand(
          state,
          {
            action: 'player',
            version: state.version,
            mutationId: crypto.randomUUID(),
            payload: {
              name: `Jugador de prueba ${i + 1}`,
              number: [4, 7, 9, 10, 12, 14, 15, 18, 21, 23, 30, 33][i],
              position: ['Base', 'Escolta', 'Alero', 'Ala-pívot', 'Pívot'][i % 5],
            },
          },
          'Administrador local',
          'ADMIN',
          adminId.toHexString(),
        );
      state.version++;
      await commitMongoState(before, state, db);
      state = await readMongoState(sandboxTeam.toHexString(), sandboxSeason.toHexString(), db);
    }
    if (!state.games.length) {
      const before = structuredClone(state);
      applyCommand(
        state,
        {
          action: 'practice',
          payload: {},
          version: state.version,
          mutationId: crypto.randomUUID(),
        },
        'Administrador local',
        'ADMIN',
        adminId.toHexString(),
      );
      state.version++;
      await commitMongoState(before, state, db);
    }
    console.log(
      'Atlas conectado: equipo real vacío y laboratorio separado con 12 jugadores de prueba. Acceso local limitado a este ordenador.',
    );
  } else console.log('Equipo y temporada preparados, sin jugadores ni partidos ficticios.');
} catch (error) {
  console.error(
    'No se ha podido completar el seed. Revisa configuración y cuenta de administrador.',
    (error as { code?: string }).code || 'CONFIGURATION_ERROR',
  );
  process.exitCode = 1;
} finally {
  await client?.close().catch(() => {});
}
