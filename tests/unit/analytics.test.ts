import { describe, expect, it } from 'vitest';
import { seedState } from '@/lib/seed';
import { gamePeriod, combineStats } from '@/domain/basketball/analytics';
import { aggregate, derive, emptyStats } from '@/domain/basketball/stats';
import type { Game, GameEvent } from '@/domain/basketball/types';

function fixture() {
  const state = seedState(),
    players = state.players.slice(0, 6).map((player) => player.id);
  const event = (
    type: GameEvent['type'],
    period: number,
    elapsed: number,
    data: Partial<GameEvent> = {},
  ): GameEvent => ({
    id: crypto.randomUUID(),
    mutationId: crypto.randomUUID(),
    sequence: elapsed + 1,
    type,
    period,
    elapsed,
    remaining: 600 - (elapsed % 600),
    createdBy: 'test',
    createdAt: state.games[0].date,
    ...data,
  });
  const game: Game = {
    ...state.games[0],
    status: 'LIVE',
    roster: players,
    period: 2,
    remaining: 0,
    elapsed: 1200,
    rules: { periods: 4, periodSeconds: 600, overtimeSeconds: 300 },
    events: [
      event('LINEUP_SET', 1, 0, { lineup: players.slice(0, 5) }),
      event('SHOT_3_MADE', 1, 100, { playerId: players[0] }),
      event('SUBSTITUTION', 2, 650, { lineup: [...players.slice(1, 5), players[5]] }),
      event('SHOT_2_MADE', 2, 700, { playerId: players[5] }),
      event('SHOT_3_MADE', 2, 710, { playerId: players[5], voided: true }),
      event('OPPONENT_SCORE', 2, 720, { points: 3 }),
    ],
  };
  return { game, players, event };
}

describe('Gráficas y periodos', () => {
  it('recupera el quinteto al inicio del cuarto y distribuye minutos tras un cambio', () => {
    const { game, players } = fixture();
    const before = structuredClone(game);
    const quarter = gamePeriod(game, 2);
    expect(aggregate([quarter], players[0]).Min).toBe(50);
    expect(aggregate([quarter], players[5]).Min).toBe(550);
    expect(aggregate([quarter], players[1]).Min).toBe(600);
    expect(aggregate([quarter], players[0]).Pts).toBe(0);
    expect(aggregate([quarter], players[5]).Pts).toBe(2);
    expect(aggregate([quarter], players[5])['+/-']).toBe(-1);
    expect(game).toEqual(before);
  });
  it('excluye cuartos futuros y acciones anuladas sin inventar intentos', () => {
    const { game, players } = fixture();
    expect(aggregate([gamePeriod(game, 2)], players[5]).T3I).toBe(0);
    expect(aggregate([gamePeriod(game, 2)], players[5])['T3%']).toBeNull();
    expect(aggregate([gamePeriod(game, 3)], players[0]).Partidos).toBe(0);
  });
  it('calcula prórrogas con su duración propia', () => {
    const { game, players, event } = fixture();
    game.period = 5;
    game.elapsed = 2490;
    game.remaining = 210;
    game.events.push(event('SHOT_3_MADE', 5, 2450, { playerId: players[5] }));
    const overtime = gamePeriod(game, 5);
    expect(overtime.elapsed).toBe(90);
    expect(overtime.remaining).toBe(210);
    expect(aggregate([overtime], players[5]).Min).toBe(90);
    expect(aggregate([overtime], players[5]).Pts).toBe(3);
  });
  it('pondera el acierto por intentos y no suma el más/menos individual', () => {
    const one = derive({ ...emptyStats(), T3A: 1, T3I: 1, '+/-': 3 });
    const nine = derive({ ...emptyStats(), T3A: 1, T3I: 9, '+/-': -2 });
    const combined = combineStats([one, nine]);
    expect(combined['T3%']).toBe(20);
    expect(combined.T3I).toBe(10);
    expect(combined['+/-']).toBeNull();
  });
});
