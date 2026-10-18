import {
  type AppState,
  type Game,
  type GameEvent,
  defaultRules,
  type Action,
} from '@/domain/basketball/types';
const names = [
  'Álex Martín',
  'Pablo García',
  'Dani López',
  'Marcos Ruiz',
  'Hugo Sánchez',
  'Lucas Pérez',
  'Adrián Torres',
  'Mario Romero',
  'Diego Navarro',
  'Javier Gil',
  'Sergio Molina',
  'Nico Alonso',
];
const playerIds = names.map((_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
export const teamId = '10000000-0000-4000-8000-000000000001';
export function seedState(): AppState {
  const players = names.map((name, i) => ({
    id: playerIds[i],
    name,
    number: [4, 7, 9, 10, 12, 14, 15, 18, 21, 23, 30, 33][i],
    position: ['Base', 'Escolta', 'Alero', 'Ala-pívot', 'Pívot'][i % 5],
    active: true,
  }));
  const games: Game[] = [];
  const rivals = [
    'CB Pozuelo',
    'Las Rozas CB',
    'Baloncesto Torrelodones',
    'CB Majadahonda',
    'Estudiantes',
    'CB Tres Cantos',
  ];
  for (let n = 0; n < 6; n++) {
    const game: Game = {
      id: `20000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`,
      opponent: rivals[n],
      date: `2026-10-${String(3 + n * 2).padStart(2, '0')}T10:00:00.000Z`,
      timezone: 'Europe/Madrid',
      venue: n % 2 ? 'AWAY' : 'HOME',
      competition: 'Liga · Jornada ' + (n + 1),
      status: 'FINAL',
      roster: playerIds,
      rules: { ...defaultRules },
      period: 4,
      remaining: 0,
      elapsed: 2400,
      events: [],
      version: 0,
    };
    let seq = 0;
    const add = (
      type: GameEvent['type'],
      elapsed: number,
      playerId?: string,
      points?: number,
      lineup?: string[],
    ) => {
      const id = `${game.id}-${++seq}`;
      game.events.push({
        id,
        mutationId: id,
        sequence: seq,
        type,
        elapsed,
        period: Math.min(4, Math.floor(elapsed / 600) + 1),
        remaining: 600 - (elapsed % 600),
        playerId,
        points,
        lineup,
        createdBy: 'demo-seed',
        createdAt: game.date,
      });
    };
    let lineup = playerIds.slice(0, 5);
    add('LINEUP_SET', 0, undefined, undefined, lineup);
    for (let j = 1; j <= 75; j++) {
      const t = j * 31;
      if (j === 25 || j === 50) {
        lineup =
          j === 25
            ? playerIds.slice(5, 10)
            : [playerIds[0], playerIds[2], playerIds[6], playerIds[10], playerIds[11]];
        add('SUBSTITUTION', t, undefined, undefined, lineup);
      }
      if (j % 3 === 0) add('OPPONENT_SCORE', t, undefined, n % 2 ? 1 : j % 4 === 0 ? 3 : 2);
      else {
        const type: Action = (
          [
            'SHOT_2_MADE',
            'SHOT_3_MADE',
            'SHOT_2_MISSED',
            'DEF_REBOUND',
            'ASSIST',
            'FREE_THROW_MADE',
            'TURNOVER',
          ] as Action[]
        )[(j + n) % 7];
        add(type, t, lineup[j % 5]);
      }
    }
    games.push(game);
  }
  games.push({
    id: '20000000-0000-4000-8000-000000000007',
    opponent: 'CB Alcobendas',
    date: '2026-10-24T16:00:00.000Z',
    timezone: 'Europe/Madrid',
    venue: 'HOME',
    competition: 'Liga · Jornada 7',
    status: 'SCHEDULED',
    roster: playerIds,
    rules: { ...defaultRules },
    period: 1,
    remaining: 600,
    elapsed: 0,
    events: [],
    version: 0,
  });
  return {
    teamId,
    seasonId: '40000000-0000-4000-8000-000000000001',
    team: 'CDI Rozasbasket',
    category: 'Sénior · Baloncesto inclusivo',
    season: '2026 / 2027',
    club: 'CDI Rozasbasket',
    version: 0,
    players,
    games,
    audit: [],
  };
}
