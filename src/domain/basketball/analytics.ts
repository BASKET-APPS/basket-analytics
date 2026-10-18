import { columns, type Game, type GameEvent, type Stats } from './types';
import { derive, emptyStats, reduceGameEvents } from './stats';

export function shotQuality(made: number, attempts: number, target: number) {
  if (!attempts) return { level: 'empty', color: '#e7ebe6', label: 'Sin intentos' };
  const percent = (made / attempts) * 100;
  if (percent >= target) return { level: 'good', color: '#b7e4c8', label: 'Objetivo alcanzado' };
  if (percent >= target * 0.75)
    return { level: 'medium', color: '#ffe09b', label: 'Cerca del objetivo' };
  return { level: 'low', color: '#f4b8b2', label: 'Por debajo del objetivo' };
}

export function gamePeriod(game: Game, period: number): Game {
  const start =
    Math.min(period - 1, game.rules.periods) * game.rules.periodSeconds +
    Math.max(0, period - game.rules.periods - 1) * game.rules.overtimeSeconds;
  const duration =
    period <= game.rules.periods ? game.rules.periodSeconds : game.rules.overtimeSeconds;
  const elapsed = Math.max(0, Math.min(duration, game.elapsed - start));
  const prefix = game.events.filter((event) => event.period < period);
  const lineup = reduceGameEvents({ ...game, events: prefix, elapsed: start }).lineup;
  const events: GameEvent[] = game.events
    .filter((event) => event.period === period)
    .map((event) => ({ ...event, elapsed: Math.max(0, event.elapsed - start) }));
  if (lineup.length === 5)
    events.unshift({
      id: `baseline-${period}`,
      mutationId: `baseline-${game.id}-${period}`,
      sequence: 0,
      type: 'LINEUP_SET',
      lineup,
      period,
      remaining: duration,
      elapsed: 0,
      createdBy: 'analytics',
      createdAt: game.date,
    });
  return {
    ...game,
    events: game.period < period ? [] : events,
    elapsed: game.period < period ? 0 : elapsed,
    period,
    remaining: duration - elapsed,
  };
}

/** Combine counts first so percentages remain weighted by attempts, never averaged. */
export function combineStats(rows: Stats[]): Stats {
  const total = emptyStats();
  for (const row of rows)
    for (const key of columns) {
      if (!key.includes('%') && key !== '+/-') (total[key] as number) += row[key] as number;
    }
  // Individual plus/minus cannot be summed into a team differential.
  total['+/-'] = null;
  return derive(total);
}

export const metricLabels: Record<keyof Stats, string> = {
  Min: 'Minutos',
  Pts: 'Puntos',
  T2A: 'Tiros de 2 anotados',
  T2I: 'Tiros de 2 intentados',
  'T2%': 'Acierto de 2 (%)',
  T3A: 'Triples anotados',
  T3I: 'Triples intentados',
  'T3%': 'Acierto de 3 (%)',
  T1A: 'Libres anotados',
  T1I: 'Libres intentados',
  'T1%': 'Acierto en libres (%)',
  DReb: 'Rebotes defensivos',
  OReb: 'Rebotes ofensivos',
  TReb: 'Rebotes totales',
  Asis: 'Asistencias',
  Rec: 'Recuperaciones',
  Per: 'Pérdidas',
  TapF: 'Tapones a favor',
  TapC: 'Tapones recibidos',
  Falt: 'Faltas cometidas',
  FaltR: 'Faltas recibidas',
  Val: 'Valoración',
  Partidos: 'Partidos con participación',
  '+/-': 'Más / menos',
};
