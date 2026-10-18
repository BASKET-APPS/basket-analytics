import { type Game, type Stats, type GameEvent, columns } from './types';
export function emptyStats(): Stats {
  return Object.fromEntries(
    columns.map((c) => [c, c.includes('%') || c === '+/-' ? null : 0]),
  ) as unknown as Stats;
}
export function derive(s: Stats): Stats {
  s.Pts = s.T2A * 2 + s.T3A * 3 + s.T1A;
  s.TReb = s.DReb + s.OReb;
  s['T2%'] = s.T2I ? (100 * s.T2A) / s.T2I : null;
  s['T3%'] = s.T3I ? (100 * s.T3A) / s.T3I : null;
  s['T1%'] = s.T1I ? (100 * s.T1A) / s.T1I : null;
  s.Val =
    s.Pts +
    s.TReb +
    s.Asis +
    s.Rec +
    s.TapF +
    s.FaltR -
    (s.T2I - s.T2A) -
    (s.T3I - s.T3A) -
    (s.T1I - s.T1A) -
    s.Per -
    s.TapC -
    s.Falt;
  return s;
}
export function reduceGameEvents(game: Game) {
  const stats: Record<string, Stats> = Object.fromEntries(
    game.roster.map((id) => [id, emptyStats()]),
  );
  let lineup: string[] = [],
    ours = 0,
    opponent = 0,
    last = 0,
    complete = true;
  const warnings: string[] = [];
  const seen = new Set<string>();
  const events = game.events
    .filter((e) => !e.voided)
    .sort((a, b) => a.elapsed - b.elapsed || a.sequence - b.sequence);
  const time = (to: number) => {
    for (const id of lineup) if (stats[id]) stats[id].Min += Math.max(0, to - last);
    last = to;
  };
  for (const e of events) {
    if (seen.has(e.mutationId)) continue;
    seen.add(e.mutationId);
    time(e.elapsed);
    if (e.type === 'LINEUP_SET' || e.type === 'SUBSTITUTION') {
      if (
        !e.lineup ||
        e.lineup.length !== 5 ||
        new Set(e.lineup).size !== 5 ||
        e.lineup.some((id) => !stats[id])
      ) {
        warnings.push('Quinteto inválido');
        complete = false;
        continue;
      }
      lineup = [...e.lineup];
      continue;
    }
    const points =
      e.type === 'SHOT_2_MADE'
        ? 2
        : e.type === 'SHOT_3_MADE'
          ? 3
          : e.type === 'FREE_THROW_MADE'
            ? 1
            : 0;
    if (points || e.type === 'OPPONENT_SCORE') {
      if (lineup.length !== 5) {
        complete = false;
        warnings.push('Puntuación sin quinteto completo');
      }
      const delta = e.type === 'OPPONENT_SCORE' ? -(e.points || 0) : points;
      if (e.type === 'OPPONENT_SCORE') opponent += e.points || 0;
      else ours += points;
      for (const id of lineup) if (stats[id]) stats[id]['+/-'] = (stats[id]['+/-'] ?? 0) + delta;
    }
    if (!e.playerId || !stats[e.playerId]) continue;
    const s = stats[e.playerId];
    s.Partidos = 1;
    if (e.type.startsWith('SHOT_2')) {
      s.T2I++;
      if (points) s.T2A++;
    }
    if (e.type.startsWith('SHOT_3')) {
      s.T3I++;
      if (points) s.T3A++;
    }
    if (e.type.startsWith('FREE_THROW')) {
      s.T1I++;
      if (points) s.T1A++;
    }
    const map: Partial<Record<GameEvent['type'], keyof Stats>> = {
      DEF_REBOUND: 'DReb',
      OFF_REBOUND: 'OReb',
      ASSIST: 'Asis',
      STEAL: 'Rec',
      TURNOVER: 'Per',
      BLOCK_FOR: 'TapF',
      BLOCK_AGAINST: 'TapC',
      FOUL_COMMITTED: 'Falt',
      FOUL_DRAWN: 'FaltR',
    };
    const key = map[e.type];
    if (key) (s[key] as number)++;
  }
  time(game.elapsed);
  for (const s of Object.values(stats)) {
    if (s.Min > 0) s.Partidos = 1;
    s['+/-'] = complete ? (s['+/-'] ?? (s.Partidos ? 0 : null)) : null;
    derive(s);
  }
  return { stats, lineup, ours, opponent, warnings: [...new Set(warnings)] };
}
export function aggregate(games: Game[], playerId: string): Stats {
  const total = emptyStats();
  let hasUnknown = false;
  let played = false;
  for (const game of games.filter((g) => g.status !== 'CANCELLED')) {
    const s = reduceGameEvents(game).stats[playerId];
    if (!s || !s.Partidos) continue;
    played = true;
    for (const key of columns)
      if (!key.includes('%') && key !== '+/-') (total[key] as number) += s[key] as number;
    if (s['+/-'] === null) hasUnknown = true;
    else total['+/-'] = (total['+/-'] ?? 0) + s['+/-'];
  }
  if (hasUnknown || !played) total['+/-'] = null;
  return derive(total);
}
export function formatStat(key: keyof Stats, value: number | null) {
  if (value === null) return '—';
  if (key === 'Min')
    return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  if (key.includes('%')) return `${value.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`;
  if (key === '+/-' && value > 0) return `+${value}`;
  return value.toLocaleString('es-ES', { maximumFractionDigits: 1 });
}
export function teamStats(games: Game[]): Stats {
  const total = emptyStats();
  total['+/-'] = 0;
  for (const g of games.filter((g) => g.status !== 'CANCELLED')) {
    const r = reduceGameEvents(g);
    if (
      g.elapsed > 0 ||
      g.events.some((e) => !e.voided && e.type !== 'LINEUP_SET' && e.type !== 'SUBSTITUTION')
    )
      total.Partidos++;
    for (const s of Object.values(r.stats))
      for (const key of columns)
        if (!key.includes('%') && key !== '+/-' && key !== 'Partidos')
          (total[key] as number) += s[key] as number;
    total['+/-']! += r.ours - r.opponent;
  }
  return derive(total);
}
