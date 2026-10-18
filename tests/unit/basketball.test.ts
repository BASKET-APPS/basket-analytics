import { describe, it, expect } from 'vitest';
import { reduceGameEvents, aggregate, formatStat, teamStats } from '@/domain/basketball/stats';
import { seedState } from '@/lib/seed';
import { applyCommand, type Command } from '@/server/service';
import { canWrite } from '@/lib/permissions';
import type { GameEvent, AppState, Role } from '@/domain/basketball/types';
function fixture() {
  const s = seedState();
  s.games = s.games.slice(-1);
  s.games[0].status = 'LIVE';
  s.games[0].events = [];
  return s;
}
function command(
  s: AppState,
  action: Command['action'],
  payload: Command['payload'],
  role: Role = 'ADMIN',
) {
  const c: Command = {
    action,
    payload,
    version: s.version,
    mutationId: crypto.randomUUID(),
    gameId: s.games[0].id,
  };
  applyCommand(s, c, 'test', role);
  return c;
}
function lineup(s: AppState) {
  command(s, 'lineup', { lineup: s.players.slice(0, 5).map((p) => p.id) });
}
const event = (
  s: AppState,
  type: string,
  playerId = s.players[0].id,
  remaining = 600,
  points?: number,
) => command(s, 'event', { type, playerId, remaining, points });
describe('Motor de baloncesto', () => {
  it('el total de equipo cuenta un partido y su diferencial oficial', () => {
    const s = fixture();
    lineup(s);
    event(s, 'SHOT_2_MADE');
    event(s, 'OPPONENT_SCORE', undefined, 590, 3);
    const total = teamStats(s.games);
    expect(total.Partidos).toBe(1);
    expect(total['+/-']).toBe(-1);
    expect(total.Min).toBe(50);
  });
  it('dos triples, un triple fallado y un libre producen siete puntos y 66,7%', () => {
    const s = fixture();
    lineup(s);
    event(s, 'SHOT_3_MADE');
    event(s, 'SHOT_3_MADE');
    event(s, 'SHOT_3_MISSED');
    event(s, 'FREE_THROW_MADE');
    const r = reduceGameEvents(s.games[0]);
    const p = r.stats[s.players[0].id];
    expect(r.ours).toBe(7);
    expect(p.T3A).toBe(2);
    expect(p.T3I).toBe(3);
    expect(p['T3%']).toBeCloseTo(66.666);
    expect(p.T1A).toBe(1);
    expect(p.Val).toBe(6);
  });
  it('aplica puntos propios y rivales solo al quinteto presente', () => {
    const s = fixture();
    lineup(s);
    event(s, 'SHOT_2_MADE');
    event(s, 'OPPONENT_SCORE', undefined, 600, 3);
    let r = reduceGameEvents(s.games[0]);
    for (const id of r.lineup) expect(r.stats[id]['+/-']).toBe(-1);
    command(s, 'lineup', { lineup: [...r.lineup.slice(1), s.players[5].id] });
    event(s, 'SHOT_3_MADE', s.players[5].id);
    r = reduceGameEvents(s.games[0]);
    expect(r.stats[s.players[0].id]['+/-']).toBe(-1);
    expect(r.stats[s.players[5].id]['+/-']).toBe(3);
  });
  it('anular tiro reconstruye puntos, intentos, valoración y +/-', () => {
    const s = fixture();
    lineup(s);
    event(s, 'SHOT_3_MADE');
    command(s, 'undo', { reason: 'Corrección de tiro' });
    const r = reduceGameEvents(s.games[0]);
    expect(r.ours).toBe(0);
    expect(r.stats[s.players[0].id].T3I).toBe(0);
    expect(r.stats[s.players[0].id].Val).toBe(0);
    expect(s.games[0].events.at(-1)?.voided).toBe(true);
    expect(s.audit.at(-1)?.detail).toContain('Corrección');
  });
  it('respeta la secuencia de sustitución y canasta al mismo instante', () => {
    const s = fixture();
    lineup(s);
    event(s, 'SHOT_2_MADE');
    command(s, 'lineup', { lineup: s.players.slice(1, 6).map((p) => p.id) });
    event(s, 'SHOT_3_MADE', s.players[5].id);
    const r = reduceGameEvents(s.games[0]);
    expect(r.stats[s.players[0].id]['+/-']).toBe(2);
    expect(r.stats[s.players[5].id]['+/-']).toBe(3);
  });
  it('no duplica eventos con la misma clave de idempotencia', () => {
    const s = fixture();
    lineup(s);
    const c = event(s, 'SHOT_3_MADE');
    applyCommand(s, c, 'test', 'ADMIN');
    const g = s.games[0];
    g.events.push({ ...g.events.at(-1)! });
    expect(reduceGameEvents(g).ours).toBe(3);
  });
  it('pondera porcentajes por intentos (1/1 y 0/9 = 10%)', () => {
    const s = fixture();
    lineup(s);
    event(s, 'SHOT_3_MADE');
    const g = structuredClone(s.games[0]);
    s.games[0].events = s.games[0].events.filter((e) => e.type !== 'SHOT_3_MADE');
    for (let i = 0; i < 9; i++) event(s, 'SHOT_3_MISSED');
    expect(aggregate([g, s.games[0]], s.players[0].id)['T3%']).toBe(10);
  });
  it('sin intentos es null y muestra —', () => {
    const s = fixture();
    expect(reduceGameEvents(s.games[0]).stats[s.players[0].id]['T2%']).toBeNull();
    expect(formatStat('T2%', null)).toBe('—');
  });
  it('sin quinteto no inventa +/-', () => {
    const s = fixture();
    s.games[0].events.push({
      id: 'x',
      mutationId: 'x',
      sequence: 1,
      type: 'SHOT_2_MADE',
      playerId: s.players[0].id,
      remaining: 500,
      period: 1,
      elapsed: 100,
      createdBy: 'test',
      createdAt: new Date().toISOString(),
    });
    const r = reduceGameEvents(s.games[0]);
    expect(r.stats[s.players[0].id]['+/-']).toBeNull();
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('reconstruye 200 minutos-jugador en 4×10', () => {
    const s = fixture();
    lineup(s);
    s.games[0].elapsed = 2400;
    const r = reduceGameEvents(s.games[0]);
    expect(Object.values(r.stats).reduce((n, p) => n + p.Min, 0)).toBe(200 * 60);
  });
  it('suma +/- individuales igual a 5 veces el diferencial', () => {
    const s = fixture();
    lineup(s);
    event(s, 'SHOT_3_MADE');
    event(s, 'OPPONENT_SCORE', undefined, 600, 2);
    s.games[0].elapsed = 60;
    const r = reduceGameEvents(s.games[0]);
    expect(Object.values(r.stats).reduce((n, p) => n + (p['+/-'] || 0), 0)).toBe(
      5 * (r.ours - r.opponent),
    );
  });
  it('no cuenta partidos cancelados', () => {
    const s = fixture();
    lineup(s);
    event(s, 'SHOT_2_MADE');
    s.games[0].status = 'CANCELLED';
    expect(aggregate(s.games, s.players[0].id).Partidos).toBe(0);
  });
  it('registra el tiempo del tiro atómicamente', () => {
    const s = fixture();
    lineup(s);
    event(s, 'SHOT_2_MADE', undefined, 523);
    expect(s.games[0].remaining).toBe(523);
    expect(s.games[0].events.at(-1)?.elapsed).toBe(77);
    expect(reduceGameEvents(s.games[0]).stats[s.players[0].id].Min).toBe(77);
  });
});
describe('Validación, permisos e históricos', () => {
  it('rechaza escrituras de lector en servidor', () => {
    const s = fixture();
    expect(() =>
      command(s, 'player', { name: 'Test Player', number: 99, position: 'Base' }, 'READER'),
    ).toThrow('rol');
    expect(canWrite('SCORER', 'player')).toBe(false);
    expect(canWrite('SCORER', 'event')).toBe(true);
  });
  it('rechaza un dorsal activo repetido', () => {
    const s = fixture();
    expect(() =>
      command(s, 'player', { name: 'Otro jugador', number: 4, position: 'Base' }),
    ).toThrow('dorsal');
  });
  it('archivar preserva eventos y estadísticas', () => {
    const s = fixture();
    lineup(s);
    event(s, 'SHOT_2_MADE');
    command(s, 'archive', { id: s.players[0].id });
    expect(s.players[0].active).toBe(false);
    expect(aggregate(s.games, s.players[0].id).Pts).toBe(2);
  });
  it('prohíbe acciones desde banquillo', () => {
    const s = fixture();
    lineup(s);
    expect(() => event(s, 'SHOT_2_MADE', s.players[7].id)).toThrow('pista');
  });
  it('rechaza quintetos duplicados y jugadores ajenos', () => {
    const s = fixture();
    expect(() => command(s, 'lineup', { lineup: Array(5).fill(s.players[0].id) })).toThrow('cinco');
    expect(() =>
      command(s, 'lineup', {
        lineup: [...s.players.slice(0, 4).map((p) => p.id), crypto.randomUUID()],
      }),
    ).toThrow('cinco');
  });
  it('no finaliza sin tiempo reglamentario completo', () => {
    const s = fixture();
    lineup(s);
    event(s, 'SHOT_2_MADE');
    expect(() => command(s, 'finalize', { ours: 2, opponent: 0 })).toThrow('Revisa');
  });
  it('comprueba minutos y marcador antes de finalizar y audita reapertura', () => {
    const s = fixture();
    lineup(s);
    event(s, 'SHOT_2_MADE');
    const g = s.games[0];
    g.elapsed = 2400;
    g.period = 4;
    g.remaining = 0;
    command(s, 'finalize', { ours: 2, opponent: 0 });
    expect(g.status).toBe('FINAL');
    command(s, 'reopen', { reason: 'Revisar acta' });
    expect(g.status).toBe('LIVE');
    expect(s.audit.at(-1)?.detail).toContain('Revisar acta');
  });
});

it('acepta referencias de fotos del propio equipo y rechaza referencias ajenas', () => {
  const s = fixture();
  const player = s.players[0];
  const photo = `/api/player-photo?teamId=${s.teamId}&id=12345678-1234-4123-8123-123456789012`;
  command(s, 'player', { ...player, photo });
  expect(s.players[0].photo).toBe(photo);
  expect(() =>
    command(s, 'player', { ...player, photo: photo.replace(s.teamId, '650000000000000000000099') }),
  ).toThrow();
});

it('permite editar un partido programado futuro y rechaza si la fecha ya pasó', () => {
  const s = fixture();
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  command(s, 'game', {
    opponent: 'Rival Inicial',
    date: futureDate,
    timezone: 'Europe/Madrid',
    venue: 'HOME',
    competition: 'Liga',
    rules: { periods: 4, periodSeconds: 600, overtimeSeconds: 300 },
  });
  const created = s.games.find((g) => g.opponent === 'Rival Inicial')!;
  expect(created).toBeDefined();

  // Edición válida
  command(s, 'game', {
    id: created.id,
    opponent: 'Rival Corregido',
    date: futureDate,
    timezone: 'Europe/Madrid',
    venue: 'AWAY',
    competition: 'Copa',
    rules: { periods: 4, periodSeconds: 600, overtimeSeconds: 300 },
  });
  expect(created.opponent).toBe('Rival Corregido');
  expect(created.venue).toBe('AWAY');
  expect(created.competition).toBe('Copa');

  // Rechazo si la fecha ya pasó
  created.date = new Date(Date.now() - 3600000).toISOString();
  expect(() =>
    command(s, 'game', {
      id: created.id,
      opponent: 'Intento Tardío',
      date: futureDate,
      timezone: 'Europe/Madrid',
      venue: 'HOME',
      competition: 'Liga',
      rules: { periods: 4, periodSeconds: 600, overtimeSeconds: 300 },
    }),
  ).toThrow('No se puede editar un partido cuya fecha ya ha pasado');
});

