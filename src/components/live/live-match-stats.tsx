'use client';
import { useState } from 'react';
import { BarChart3, ChevronDown } from 'lucide-react';
import { columns, type Game, type Player, type Stats } from '@/domain/basketball/types';
import { emptyStats, formatStat, reduceGameEvents, teamStats } from '@/domain/basketball/stats';
import PlayerPortrait from '../player-portrait';

const quickColumns: (keyof Stats)[] = [
  'Min',
  'Pts',
  'TReb',
  'Asis',
  'Rec',
  'Per',
  'TapF',
  'Falt',
  'Val',
  '+/-',
];
const labels: Partial<Record<keyof Stats, string>> = {
  Min: 'MIN',
  Pts: 'PTS',
  TReb: 'REB',
  Asis: 'ASIS',
  Rec: 'REC',
  Per: 'PER',
  TapF: 'TAP',
  Falt: 'FALT',
  Val: 'VAL',
};

export default function LiveMatchStats({
  game,
  players,
  clock,
  pending,
}: {
  game: Game;
  players: Player[];
  clock: number;
  pending: boolean;
}) {
  const [full, setFull] = useState(false);
  const [courtOnly, setCourtOnly] = useState(false);
  // Project the local clock without modifying the saved game or creating clock writes every second.
  const current = {
    ...game,
    elapsed: game.elapsed + (game.status === 'LIVE' ? Math.max(0, game.remaining - clock) : 0),
  };
  const projection = reduceGameEvents(current);
  const total = teamStats([current]);
  const visibleColumns = full ? columns.filter((key) => key !== 'Partidos') : quickColumns;
  const roster = players
    .filter(
      (player) =>
        game.roster.includes(player.id) && (!courtOnly || projection.lineup.includes(player.id)),
    )
    .sort((a, b) => a.number - b.number);
  return (
    <section
      className="live-match-stats"
      id="live-match-stats"
      aria-labelledby="live-match-stats-title"
    >
      <header className="match-stats-heading">
        <div>
          <p className="eyebrow">EL PARTIDO EN NÚMEROS</p>
          <h2 id="live-match-stats-title">
            <BarChart3 size={23} />
            Estadísticas de este partido
          </h2>
          <p>
            Solo este encuentro · {game.opponent} ·{' '}
            {game.status === 'FINAL' ? 'Resultado final' : 'Actualizadas con cada jugada'}
          </p>
        </div>
        <span className={`match-stats-status ${pending ? 'pending' : ''}`}>
          {pending
            ? 'Incluye acciones pendientes de guardar'
            : game.status === 'FINAL'
              ? 'Acta finalizada'
              : 'En directo'}
        </span>
      </header>
      <div className="match-stats-summary">
        {(
          [
            ['Puntos', total.Pts],
            ['Rebotes', total.TReb],
            ['Asistencias', total.Asis],
            ['Valoración', total.Val],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong data-testid={`match-total-${label}`}>{value}</strong>
          </div>
        ))}
      </div>
      <div className="match-stats-controls">
        <div role="group" aria-label="Jugadores en las estadísticas del partido">
          <button aria-pressed={!courtOnly} onClick={() => setCourtOnly(false)}>
            Todos los convocados
          </button>
          <button aria-pressed={courtOnly} onClick={() => setCourtOnly(true)}>
            Quinteto en pista
          </button>
        </div>
        <button aria-expanded={full} onClick={() => setFull(!full)}>
          {full ? 'Ver resumen' : 'Ver todas las estadísticas'}
          <ChevronDown size={15} />
        </button>
      </div>
      <div
        className="match-stats-scroll"
        tabIndex={0}
        role="region"
        aria-label="Tabla desplazable de estadísticas del partido"
      >
        <table aria-label="Estadísticas actuales del partido">
          <thead>
            <tr>
              <th scope="col">Jugador</th>
              {visibleColumns.map((key) => (
                <th scope="col" key={key}>
                  {labels[key] || key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roster.map((player) => {
              const stats = projection.stats[player.id] || emptyStats();
              const onCourt = projection.lineup.includes(player.id);
              return (
                <tr
                  key={player.id}
                  data-testid={`match-stats-${player.id}`}
                  className={onCourt ? 'match-stats-on-court' : ''}
                >
                  <th scope="row">
                    <span className="match-stats-player">
                      <PlayerPortrait player={player} />
                      <span>
                        <strong>{player.name}</strong>
                        <small>
                          #{player.number} · {onCourt ? 'En pista' : 'Banquillo'}
                        </small>
                      </span>
                    </span>
                  </th>
                  {visibleColumns.map((key) => (
                    <td key={key} data-stat={key} className={key === 'Pts' ? 'points' : ''}>
                      {formatStat(key, stats[key])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total del equipo</th>
              {visibleColumns.map((key) => (
                <td key={key} data-stat={key}>
                  {formatStat(key, total[key])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="match-stats-note">
        MIN en minutos:segundos. Los minutos del total suman los cinco jugadores. Los porcentajes se
        calculan sobre los intentos. Las acciones anuladas se excluyen.
        {courtOnly && ' El total sigue incluyendo a todo el equipo.'}
      </p>
    </section>
  );
}
