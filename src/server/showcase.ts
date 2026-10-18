import { newId } from '@/lib/ids';
import {
  SHOWCASE_COMPETITION,
  type AppState,
  type Game,
  type GameEvent,
} from '@/domain/basketball/types';
import { reduceGameEvents } from '@/domain/basketball/stats';
import { AppError } from './errors';

/** Add a repeatable, isolated exhibition season without replacing any existing data. */
export function addShowcaseGames(state: AppState, actor: string, now = new Date()) {
  if (!state.isSandbox)
    throw new AppError(
      403,
      'La demo de presentación solo se puede generar en el equipo de pruebas',
    );
  if (state.games.some((game) => game.competition === SHOWCASE_COMPETITION)) return 0;
  const players = state.players.filter((player) => player.active).slice(0, 12);
  if (players.length < 5)
    throw new AppError(422, 'La demo necesita al menos cinco jugadores activos');
  const opponents = [
    'Halcones Demo',
    'Toros Demo',
    'Linces Demo',
    'Cóndores Demo',
    'Lobos Demo',
    'Titanes Demo',
    'Águilas Demo',
    'Panteras Demo',
  ];
  let seed = 72841;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const profiles = [
    [0.36, 0.2, 0.5],
    [0.63, 0.44, 0.83],
    [0.47, 0.31, 0.67],
    [0.58, 0.39, 0.78],
    [0.4, 0.24, 0.58],
    [0.56, 0.42, 0.79],
  ];
  const roster = players.map((player) => player.id);
  for (let match = 0; match < 8; match++) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 17, 30),
    );
    date.setUTCDate(date.getUTCDate() + (match < 6 ? -36 + match * 7 : 6 + (match - 6) * 7));
    const game: Game = {
      id: newId(),
      opponent: opponents[match],
      date: date.toISOString(),
      timezone: 'Europe/Madrid',
      venue: match % 2 ? 'AWAY' : 'HOME',
      competition: SHOWCASE_COMPETITION,
      status: match < 6 ? 'FINAL' : 'SCHEDULED',
      roster: [...roster],
      rules: { periods: 4, periodSeconds: 600, overtimeSeconds: 300 },
      period: match < 6 ? 4 : 1,
      remaining: match < 6 ? 0 : 600,
      elapsed: match < 6 ? 2400 : 0,
      events: [],
      version: 1,
      isPractice: true,
    };
    if (match < 6) {
      const add = (
        type: GameEvent['type'],
        elapsed: number,
        lineup: string[],
        data: Partial<GameEvent> = {},
      ) => {
        const period = Math.floor(elapsed / 600) + 1;
        game.events.push({
          id: newId(),
          mutationId: crypto.randomUUID(),
          sequence: 0,
          type,
          period,
          remaining: period * 600 - elapsed,
          elapsed,
          createdBy: actor,
          createdAt: new Date(date.getTime() + elapsed * 1000).toISOString(),
          onCourtPlayerIds: [...lineup],
          ...data,
        });
      };
      for (let segment = 0; segment < 8; segment++) {
        const start = segment * 300;
        const lineup = Array.from(
          { length: 5 },
          (_, index) => roster[(segment * 2 + match + index) % roster.length],
        );
        const person = () => lineup[Math.floor(random() * lineup.length)];
        add(segment ? 'SUBSTITUTION' : 'LINEUP_SET', start, lineup, { lineup: [...lineup] });
        const attempts = 7 + Math.floor(random() * 3);
        for (let shot = 0; shot < attempts; shot++) {
          const three = random() < 0.34;
          const playerId = person();
          const playerIndex = roster.indexOf(playerId);
          const made =
            random() < profiles[match][three ? 1 : 0] + ((playerIndex % 4) - 1.5) * 0.025;
          const time = start + 16 + shot * 20;
          add(
            three
              ? made
                ? 'SHOT_3_MADE'
                : 'SHOT_3_MISSED'
              : made
                ? 'SHOT_2_MADE'
                : 'SHOT_2_MISSED',
            time,
            lineup,
            { playerId },
          );
          if (made && random() < 0.58)
            add('ASSIST', time + 1, lineup, {
              playerId: lineup[(lineup.indexOf(playerId) + 1) % 5],
            });
        }
        for (let shot = 0; shot < 2; shot++)
          add(
            random() < profiles[match][2] ? 'FREE_THROW_MADE' : 'FREE_THROW_MISSED',
            start + 202 + shot * 3,
            lineup,
            { playerId: person() },
          );
        const other: GameEvent['type'][] = [
          'DEF_REBOUND',
          'DEF_REBOUND',
          'OFF_REBOUND',
          'TURNOVER',
          'FOUL_COMMITTED',
          'STEAL',
          'FOUL_DRAWN',
        ];
        if (random() < 0.5) other.push('BLOCK_FOR');
        other.forEach((type, index) =>
          add(type, start + 216 + index * 6, lineup, { playerId: person() }),
        );
        for (let score = 0; score < 4; score++)
          add('OPPONENT_SCORE', start + 32 + score * 78, lineup, {
            points: random() < 0.15 ? 1 : random() < 0.28 ? 3 : 2,
          });
      }
      game.events
        .sort((a, b) => a.elapsed - b.elapsed)
        .forEach((event, index) => {
          event.sequence = index + 1;
        });
      const result = reduceGameEvents(game);
      if (result.ours === result.opponent) {
        const lineup = result.lineup;
        add('OPPONENT_SCORE', 2398, lineup, { points: 1 });
        game.events.at(-1)!.sequence = game.events.length;
      }
    }
    state.games.push(game);
  }
  return 8;
}
