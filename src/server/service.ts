import { z } from 'zod';
import {
  actions,
  type AppState,
  type GameEvent,
  type Role,
  type Game,
} from '@/domain/basketball/types';
import { reduceGameEvents } from '@/domain/basketball/stats';
import { canWrite } from '@/lib/permissions';
import { AppError } from './errors';
import { entityId, newId } from '@/lib/ids';
import { addShowcaseGames } from './showcase';
const rules = z.object({
  periods: z.number().int().min(1).max(12),
  periodSeconds: z.number().int().min(60).max(3600),
  overtimeSeconds: z.number().int().min(60).max(1200),
});
const player = z.object({
  id: entityId.optional(),
  name: z.string().trim().min(2).max(80),
  number: z.number().int().min(0).max(99),
  position: z.string().max(40),
  active: z.boolean().default(true),
  photo: z.string().max(400000).optional(),
});
const game = z.object({
  opponent: z.string().trim().min(2).max(100),
  date: z.string().datetime(),
  timezone: z.literal('Europe/Madrid'),
  venue: z.enum(['HOME', 'AWAY', 'NEUTRAL']),
  competition: z.string().max(100),
  rules,
});
export const commandSchema = z.object({
  action: z.enum([
    'player',
    'archive',
    'game',
    'roster',
    'lineup',
    'event',
    'undo',
    'clock',
    'period',
    'start',
    'finalize',
    'reopen',
    'team',
    'prepare',
    'practice',
    'showcase',
  ]),
  version: z.number().int().min(0),
  gameId: entityId.optional(),
  mutationId: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
});
export type Command = z.infer<typeof commandSchema>;
export function applyCommand(
  s: AppState,
  c: Command,
  actor: string,
  role: Role,
  actorUserId?: string,
) {
  if (!canWrite(role, c.action)) throw new AppError(403, 'Tu rol no permite esta acción');
  const audit = (detail: string) =>
    s.audit.push({
      id: newId(),
      mutationId: c.mutationId,
      at: new Date().toISOString(),
      actor,
      actorId: actorUserId,
      action: c.action,
      detail,
    });
  if (c.action === 'showcase') {
    if (role !== 'ADMIN') throw new AppError(403, 'Solo el administrador puede preparar la demo');
    const created = addShowcaseGames(s, actor);
    if (created)
      audit('Demo de presentación: seis partidos finalizados y dos próximos; todos simulados');
    return;
  }
  if (c.action === 'practice') {
    const active = s.players.filter((p) => p.active);
    if (active.length < 5)
      throw new AppError(
        422,
        'Para practicar, añade al menos cinco jugadores a la plantilla o abre la demo local',
      );
    const id = newId(),
      now = new Date().toISOString();
    const practice: Game = {
      id,
      opponent: 'Rival de prueba',
      date: now,
      timezone: 'Europe/Madrid',
      venue: 'HOME',
      competition: 'Entrenamiento del anotador',
      status: 'LIVE',
      roster: active.map((p) => p.id),
      rules: { periods: 4, periodSeconds: 600, overtimeSeconds: 300 },
      period: 1,
      remaining: 600,
      elapsed: 0,
      events: [
        {
          id: newId(),
          mutationId: c.mutationId,
          sequence: 1,
          type: 'LINEUP_SET',
          lineup: active.slice(0, 5).map((p) => p.id),
          period: 1,
          remaining: 600,
          elapsed: 0,
          createdAt: now,
          createdBy: actor,
        },
      ],
      version: 0,
      isPractice: true,
    };
    s.games.push(practice);
    audit('Creado partido de prueba · excluido de las estadísticas oficiales');
    return;
  }
  if (c.action === 'player') {
    const p = player.parse(c.payload);
    const ownedPhoto =
      p.photo?.startsWith(`/api/player-photo?teamId=${s.teamId}&id=`) &&
      /^[a-f0-9-]{36}$/.test(p.photo.split('&id=')[1]);
    if (
      p.photo &&
      !ownedPhoto &&
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.photo)
    )
      throw new AppError(400, 'La foto debe ser PNG, JPEG o WebP, máximo 280 KB');
    if (p.photo && !ownedPhoto && typeof Buffer !== 'undefined') {
      const b = Buffer.from(p.photo.split(',')[1], 'base64');
      if (
        !(
          b.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
          b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP')
        )
      )
        throw new AppError(400, 'El contenido de la imagen no es válido');
    }
    if (
      s.players.some(
        (other) => other.active && p.active && other.number === p.number && other.id !== p.id,
      )
    )
      throw new AppError(422, 'Ese dorsal ya está asignado en esta temporada');
    if (p.id) {
      const current = s.players.find((x) => x.id === p.id);
      if (!current) throw new AppError(404, 'Jugador no encontrado');
      Object.assign(current, p);
    } else s.players.push({ ...p, id: newId() });
    audit(`${p.id ? 'Editar' : 'Alta'}: ${p.name}, dorsal ${p.number}`);
    return;
  }
  if (c.action === 'archive') {
    const id = entityId.parse(c.payload.id);
    const p = s.players.find((x) => x.id === id);
    if (!p) throw new AppError(404, 'Jugador no encontrado');
    if (!p.active && s.players.some((x) => x.active && x.number === p.number))
      throw new AppError(422, 'Dorsal ocupado');
    p.active = !p.active;
    audit(`${p.active ? 'Restaurar' : 'Archivar'}: ${p.name}`);
    return;
  }
  if (c.action === 'team') {
    const p = z
      .object({ team: z.string().trim().min(2).max(80), category: z.string().max(80) })
      .parse(c.payload);
    s.team = p.team;
    s.category = p.category;
    audit('Datos del equipo actualizados');
    return;
  }
  if (c.action === 'game') {
    const data = game.parse(c.payload);
    s.games.push({
      ...data,
      id: newId(),
      status: 'SCHEDULED',
      roster: s.players.filter((p) => p.active).map((p) => p.id),
      period: 1,
      remaining: data.rules.periodSeconds,
      elapsed: 0,
      events: [],
      version: 0,
    });
    audit(`Nuevo partido: ${data.opponent}`);
    return;
  }
  const g = s.games.find((x) => x.id === c.gameId);
  if (!g) throw new AppError(404, 'Partido no encontrado');
  if (g.status === 'FINAL' && c.action !== 'reopen')
    throw new AppError(422, 'Reabre el partido antes de modificarlo');
  const emit = (data: Partial<GameEvent> & { type: GameEvent['type'] }) => {
    if (g.events.some((e) => e.mutationId === c.mutationId)) return;
    g.events.push({
      id: newId(),
      mutationId: c.mutationId,
      sequence: g.events.length + 1,
      period: g.period,
      remaining: g.remaining,
      elapsed: g.elapsed,
      createdAt: new Date().toISOString(),
      createdBy: actorUserId || actor,
      ...data,
    });
  };
  if (c.action === 'prepare') {
    if (g.status !== 'SCHEDULED') throw new AppError(422, 'El partido ya está iniciado');
    const ids = z.array(entityId).min(5).max(30).parse(c.payload.roster);
    const starters = z.array(entityId).length(5).parse(c.payload.lineup);
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => !s.players.some((p) => p.id === id)) ||
      new Set(starters).size !== 5 ||
      starters.some((id) => !ids.includes(id))
    )
      throw new AppError(422, 'Revisa la convocatoria y los cinco titulares');
    g.roster = ids;
    emit({ type: 'LINEUP_SET', lineup: starters });
    g.status = 'LIVE';
    audit('Convocatoria y cinco titulares confirmados; partido iniciado');
  } else if (c.action === 'roster') {
    const ids = z.array(entityId).min(5).max(30).parse(c.payload.roster);
    if (new Set(ids).size !== ids.length || ids.some((id) => !s.players.some((p) => p.id === id)))
      throw new AppError(422, 'Convocatoria no válida');
    if (
      g.events.some(
        (e) =>
          !e.voided &&
          ((e.playerId && !ids.includes(e.playerId)) || e.lineup?.some((id) => !ids.includes(id))),
      )
    )
      throw new AppError(422, 'No se puede retirar a jugadores con participación registrada');
    g.roster = ids;
    audit(`Convocatoria actualizada: ${ids.length} jugadores`);
  } else if (c.action === 'lineup') {
    if (c.payload.remaining !== undefined) {
      const remaining = z.number().int().min(0).max(g.remaining).parse(c.payload.remaining);
      g.elapsed += g.remaining - remaining;
      g.remaining = remaining;
    }
    const ids = z.array(entityId).length(5).parse(c.payload.lineup);
    if (new Set(ids).size !== 5 || ids.some((id) => !g.roster.includes(id)))
      throw new AppError(422, 'Selecciona cinco convocados diferentes');
    emit({ type: g.events.length ? 'SUBSTITUTION' : 'LINEUP_SET', lineup: ids });
    audit('Quinteto registrado');
  } else if (c.action === 'start') {
    if (reduceGameEvents(g).lineup.length !== 5)
      throw new AppError(422, 'Define el quinteto inicial');
    g.status = 'LIVE';
    audit('Partido iniciado');
  } else if (c.action === 'event') {
    if (g.status !== 'LIVE') throw new AppError(422, 'Inicia el partido para anotar');
    const p = z
      .object({
        type: z.enum(['OPPONENT_SCORE', ...Object.keys(actions)]),
        playerId: entityId.optional(),
        points: z.number().int().min(1).max(3).optional(),
        remaining: z.number().int().min(0).optional(),
      })
      .parse(c.payload);
    if (p.remaining !== undefined) {
      const duration =
        g.period <= g.rules.periods ? g.rules.periodSeconds : g.rules.overtimeSeconds;
      if (p.remaining > g.remaining || p.remaining > duration)
        throw new AppError(422, 'Reloj incoherente; guarda el reloj oficial');
      g.elapsed += g.remaining - p.remaining;
      g.remaining = p.remaining;
    }
    const projection = reduceGameEvents(g);
    if (projection.lineup.length !== 5)
      throw new AppError(422, 'Se requieren cinco jugadores en pista');
    if (p.type === 'OPPONENT_SCORE') {
      if (!p.points) throw new AppError(422, 'Indica los puntos del rival');
    } else if (!p.playerId || !projection.lineup.includes(p.playerId))
      throw new AppError(422, 'El jugador debe estar en pista');
    emit({ ...p, type: p.type as GameEvent['type'], onCourtPlayerIds: [...projection.lineup] });
    audit(
      `${p.type} · ${p.playerId ? s.players.find((x) => x.id === p.playerId)?.name : g.opponent}`,
    );
  } else if (c.action === 'undo') {
    const reason = z.string().trim().min(3).max(300).parse(c.payload.reason);
    const eventId = z.string().optional().parse(c.payload.eventId);
    const e = eventId
      ? g.events.find((e) => e.id === eventId && !e.voided)
      : [...g.events].reverse().find((e) => !e.voided);
    if (!e) throw new AppError(422, 'No hay acciones para anular');
    if (
      (e.type === 'LINEUP_SET' || e.type === 'SUBSTITUTION') &&
      g.events.some((x) => !x.voided && x.sequence > e.sequence)
    )
      throw new AppError(422, 'Anula primero las acciones posteriores a este quinteto');
    e.voided = true;
    e.reason = reason;
    audit(`Anular ${e.id}: ${reason}`);
  } else if (c.action === 'clock') {
    const remaining = z.number().int().min(0).parse(c.payload.remaining);
    const duration = g.period <= g.rules.periods ? g.rules.periodSeconds : g.rules.overtimeSeconds;
    if (remaining > duration) throw new AppError(422, 'El reloj supera la duración del periodo');
    const before =
      Math.min(g.period - 1, g.rules.periods) * g.rules.periodSeconds +
      Math.max(0, g.period - 1 - g.rules.periods) * g.rules.overtimeSeconds;
    const elapsed = before + duration - remaining;
    if (g.events.some((e) => !e.voided && e.elapsed > elapsed))
      throw new AppError(422, 'El reloj no puede retroceder por delante de eventos registrados');
    g.remaining = remaining;
    g.elapsed = elapsed;
  } else if (c.action === 'period') {
    if (g.remaining !== 0)
      throw new AppError(422, 'Agota o ajusta el reloj antes de cambiar de periodo');
    const result = reduceGameEvents(g);
    if (g.period >= g.rules.periods && result.ours !== result.opponent)
      throw new AppError(422, 'El partido ya puede finalizar; no corresponde prórroga');
    g.period++;
    g.remaining = g.period <= g.rules.periods ? g.rules.periodSeconds : g.rules.overtimeSeconds;
    audit(`Inicio periodo ${g.period}`);
  } else if (c.action === 'finalize') {
    const p = z.object({ ours: z.number(), opponent: z.number() }).parse(c.payload);
    const r = reduceGameEvents(g);
    if (
      g.period < g.rules.periods ||
      g.remaining !== 0 ||
      r.ours === r.opponent ||
      r.warnings.length ||
      p.ours !== r.ours ||
      p.opponent !== r.opponent
    )
      throw new AppError(422, 'Revisa periodos, reloj, marcador y quintetos antes de cerrar');
    const minutes = Object.values(r.stats).reduce((a, s) => a + s.Min, 0);
    if (minutes !== g.elapsed * 5)
      throw new AppError(422, 'Los minutos del quinteto no son coherentes');
    g.status = 'FINAL';
    audit(`Finalizado ${r.ours}–${r.opponent}; minutos comprobados`);
  } else if (c.action === 'reopen') {
    if (!['ADMIN', 'COACH'].includes(role))
      throw new AppError(403, 'Solo administrador o entrenador');
    const reason = z.string().trim().min(3).parse(c.payload.reason);
    g.status = 'LIVE';
    audit(`Reapertura: ${reason}`);
  }
  g.version++;
}
