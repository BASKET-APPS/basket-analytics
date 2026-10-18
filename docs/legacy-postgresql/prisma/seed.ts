import { PrismaClient, Prisma } from '@prisma/client';
import { seedState } from '../src/lib/seed';
const db = new PrismaClient();
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
async function main() {
  const s = seedState();
  const clubId = '30000000-0000-4000-8000-000000000001',
    seasonId = '40000000-0000-4000-8000-000000000001',
    tsId = '50000000-0000-4000-8000-000000000001';
  await db.club.upsert({
    where: { id: clubId },
    create: { id: clubId, name: s.club, logoUrl: '/club/logo.png' },
    update: {},
  });
  await db.team.upsert({
    where: { id: s.teamId },
    create: { id: s.teamId, clubId, name: s.team, category: s.category },
    update: {},
  });
  await db.season.upsert({
    where: { id: seasonId },
    create: {
      id: seasonId,
      clubId,
      name: s.season,
      startsAt: new Date('2026-09-01'),
      endsAt: new Date('2027-07-01'),
    },
    update: {},
  });
  await db.teamSeason.upsert({
    where: { id: tsId },
    create: { id: tsId, teamId: s.teamId, seasonId },
    update: {},
  });
  // Empty production catalog by default. Opt-in fixture data only for an isolated test database.
  if (process.env.SEED_DEMO === 'true') {
    for (const p of s.players) {
      const { number, active, ...data } = p;
      await db.player.upsert({ where: { id: p.id }, create: data, update: {} });
      await db.rosterEntry.upsert({
        where: { teamSeasonId_playerId: { teamSeasonId: tsId, playerId: p.id } },
        create: { teamSeasonId: tsId, playerId: p.id, number, active },
        update: {},
      });
    }
    for (const g of s.games) {
      const { events, ...raw } = g;
      await db.game.upsert({
        where: { id: g.id },
        create: {
          ...raw,
          date: new Date(raw.date),
          roster: json(g.roster),
          rules: json(g.rules),
          teamSeasonId: tsId,
        },
        update: {},
      });
      for (const e of events)
        await db.gameEvent.upsert({
          where: { id: e.id },
          create: {
            id: e.id,
            mutationId: e.mutationId,
            gameId: g.id,
            sequence: e.sequence,
            payload: json(e),
          },
          update: {},
        });
    }
  }
  if (process.env.ADMIN_EMAIL) {
    const user = await db.user.findUnique({ where: { email: process.env.ADMIN_EMAIL } });
    if (!user) throw Error('Inicia sesión primero con ADMIN_EMAIL y vuelve a ejecutar el seed.');
    await db.membership.upsert({
      where: { userId_teamId: { userId: user.id, teamId: s.teamId } },
      create: { userId: user.id, teamId: s.teamId, role: 'ADMIN' },
      update: { role: 'ADMIN' },
    });
  }
  console.log('Club, equipo y temporada preparados. Los usuarios sin membresía no tienen acceso.');
}
main().finally(() => db.$disconnect());
