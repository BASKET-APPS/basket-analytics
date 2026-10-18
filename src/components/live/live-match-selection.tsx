'use client';
import { useState } from 'react';
import { ArrowRight, CalendarDays, FlaskConical, Users } from 'lucide-react';
import type { Game } from '@/domain/basketball/types';
import { reduceGameEvents } from '@/domain/basketball/stats';

export default function LiveMatchSelection({
  games,
  sandbox = false,
  team,
  busy,
  canScore,
  onOpen,
  onPractice,
}: {
  games: Game[];
  sandbox?: boolean;
  team: string;
  busy: boolean;
  canScore: boolean;
  onOpen: (id: string) => void;
  onPractice: () => void;
}) {
  const [filter, setFilter] = useState('ALL');
  const tabs = [
    ['ALL', 'Todos'],
    ['LIVE', 'En curso'],
    ['SCHEDULED', 'Próximos'],
    ['FINAL', 'Finalizados'],
    ['PRACTICE', 'Simulaciones'],
  ];
  const visible = games
    .filter(
      (g) =>
        g.status !== 'CANCELLED' &&
        (filter === 'ALL' ||
          (filter === 'PRACTICE'
            ? g.isPractice
            : g.status === filter && (!g.isPractice || sandbox))),
    )
    .sort((a, b) => {
      const rank = (g: Game) =>
        (g.isPractice ? 3 : 0) + (g.status === 'LIVE' ? 0 : g.status === 'SCHEDULED' ? 1 : 2);
      return (
        rank(a) - rank(b) ||
        (a.status === 'SCHEDULED' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date))
      );
    });
  return (
    <section className="live-match-selection" aria-label="Seleccionar partido para el anotador">
      <div className="match-selection-tools">
        <div role="group" aria-label="Filtrar partidos del anotador">
          {tabs.map(([id, label]) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <button className="practice-link" disabled={busy || !canScore} onClick={onPractice}>
          <FlaskConical size={17} />
          Nueva simulación
        </button>
      </div>
      <div className="match-selection-grid">
        {visible.map((game) => {
          const score = reduceGameEvents(game);
          const status = game.isPractice
            ? 'SIMULACIÓN'
            : game.status === 'LIVE'
              ? 'EN CURSO'
              : game.status === 'FINAL'
                ? 'FINALIZADO'
                : 'PRÓXIMO PARTIDO';
          return (
            <article
              key={game.id}
              className={`match-choice-card ${game.status === 'LIVE' ? 'is-live' : ''}`}
              data-game-id={game.id}
            >
              <div className="match-choice-meta">
                <span
                  className={`match-choice-status ${game.isPractice ? 'practice' : game.status.toLowerCase()}`}
                >
                  {status}
                </span>
                <span>
                  {game.venue === 'HOME' ? 'En casa' : game.venue === 'AWAY' ? 'Fuera' : 'Neutral'}
                </span>
              </div>
              <p className="match-choice-team">
                {team}
                <span>vs.</span>
              </p>
              <h2>{game.opponent}</h2>
              <p className="match-choice-date">
                <CalendarDays size={15} />
                {new Date(game.date).toLocaleString('es-ES', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Europe/Madrid',
                })}
              </p>
              {game.status !== 'SCHEDULED' ? (
                <div className="match-choice-score">
                  <strong>
                    {score.ours} <span>–</span> {score.opponent}
                  </strong>
                  <span>
                    {game.status === 'FINAL'
                      ? 'Resultado final'
                      : game.period > game.rules.periods
                        ? `Prórroga ${game.period - game.rules.periods}`
                        : `Cuarto ${game.period} de ${game.rules.periods}`}
                  </span>
                </div>
              ) : (
                <div className="match-choice-score scheduled">
                  <span>Prepara la convocatoria y los cinco titulares.</span>
                </div>
              )}
              <div className="match-choice-roster">
                <Users size={15} />
                {game.roster.length} convocados
                {game.competition && <span> · {game.competition}</span>}
              </div>
              <button className="primary" disabled={busy} onClick={() => onOpen(game.id)}>
                {game.status === 'SCHEDULED'
                  ? 'Preparar partido'
                  : game.status === 'FINAL'
                    ? 'Ver partido y estadísticas'
                    : 'Continuar partido'}
                <ArrowRight size={18} />
              </button>
            </article>
          );
        })}
      </div>
      {!visible.length && (
        <div className="match-selection-empty">
          <CalendarDays size={32} />
          <h2>No hay partidos en esta vista.</h2>
          <p>Crea un partido desde el calendario o abre una simulación para practicar.</p>
        </div>
      )}
    </section>
  );
}
