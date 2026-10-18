import { describe, it, expect } from 'vitest';
import { seedState } from '@/lib/seed';
import { addShowcaseGames } from '@/server/showcase';
import { applyCommand } from '@/server/service';
import { SHOWCASE_COMPETITION } from '@/domain/basketball/types';
import { reduceGameEvents } from '@/domain/basketball/stats';
import { shotQuality } from '@/domain/basketball/analytics';

describe('Demo de presentación y colores del mapa', () => {
  it('clasifica acierto frente a objetivos sin confundir cero intentos con fallos', () => {
    expect(shotQuality(5, 10, 50).level).toBe('good');
    expect(shotQuality(4, 10, 50).level).toBe('medium');
    expect(shotQuality(2, 10, 50).level).toBe('low');
    expect(shotQuality(0, 0, 50).level).toBe('empty');
    expect(shotQuality(3, 10, 30).level).toBe('good');
  });
  it('crea ocho simulaciones coherentes sin modificar datos previos ni duplicarlas', () => {
    const state = seedState();
    state.isSandbox = true;
    const previous = structuredClone(state.games);
    expect(addShowcaseGames(state, 'Demo', new Date('2026-10-18T12:00:00Z'))).toBe(8);
    const games = state.games.filter((game) => game.competition === SHOWCASE_COMPETITION);
    expect(games.filter((game) => game.status === 'FINAL')).toHaveLength(6);
    expect(games.filter((game) => game.status === 'SCHEDULED')).toHaveLength(2);
    expect(games.every((game) => game.isPractice)).toBe(true);
    expect(state.games.slice(0, previous.length)).toEqual(previous);
    const totals: number[] = [];
    for (const game of games.filter((game) => game.status === 'FINAL')) {
      const result = reduceGameEvents(game);
      expect(result.warnings).toEqual([]);
      expect(result.lineup).toHaveLength(5);
      expect(new Set(result.lineup).size).toBe(5);
      expect(result.ours).not.toBe(result.opponent);
      expect(Object.values(result.stats).reduce((sum, stats) => sum + stats.Min, 0)).toBe(2400 * 5);
      expect(Object.values(result.stats).reduce((sum, stats) => sum + stats.Pts, 0)).toBe(
        result.ours,
      );
      expect(Object.values(result.stats).every((stats) => stats.Min > 0)).toBe(true);
      expect(game.events.every((event, index) => event.sequence === index + 1)).toBe(true);
      totals.push(result.ours);
    }
    expect(new Set(totals).size).toBeGreaterThan(3);
    expect(addShowcaseGames(state, 'Demo')).toBe(0);
    expect(state.games.length).toBe(previous.length + 8);
  });
  it('impide generar la presentación fuera del equipo de pruebas o sin administrador', () => {
    const state = seedState();
    expect(() => addShowcaseGames(state, 'Demo')).toThrow(/solo se puede generar/);
    state.isSandbox = true;
    expect(() =>
      applyCommand(
        state,
        {
          action: 'showcase',
          payload: {},
          version: state.version,
          mutationId: crypto.randomUUID(),
        },
        'Test',
        'COACH',
      ),
    ).toThrow(/administrador/);
  });
});
