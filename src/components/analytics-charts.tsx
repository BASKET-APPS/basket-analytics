'use client';
import { useId, useState, type CSSProperties } from 'react';
import { BarChart3, Filter, Flame, RotateCcw, Target, TrendingUp } from 'lucide-react';
import { columns, type Game, type Player, type Stats } from '@/domain/basketball/types';
import { aggregate, formatStat, teamStats } from '@/domain/basketball/stats';
import { combineStats, gamePeriod, metricLabels, shotQuality } from '@/domain/basketball/analytics';

const colors = ['#007c87', '#b46822', '#6756a5', '#b13d62'];
const shots = [
  { name: '2 puntos', made: 'T2A', attempts: 'T2I' },
  { name: '3 puntos', made: 'T3A', attempts: 'T3I' },
  { name: 'Tiros libres', made: 'T1A', attempts: 'T1I' },
] as const;

export default function AnalyticsCharts({
  players,
  games,
  comparison = false,
  includePracticeByDefault = false,
}: {
  players: Player[];
  games: Game[];
  comparison?: boolean;
  includePracticeByDefault?: boolean;
}) {
  const id = useId();
  const [playerId, setPlayer] = useState('ALL');
  const [gameId, setGame] = useState('ALL');
  const [period, setPeriod] = useState('ALL');
  const [metric, setMetric] = useState<keyof Stats>('Pts');
  const [mean, setMean] = useState(false);
  const [practice, setPractice] = useState(includePracticeByDefault);
  const [targets, setTargets] = useState({ two: 50, three: 35, free: 70 });
  const selectedPlayers =
    comparison || playerId === 'ALL' ? players : players.filter((player) => player.id === playerId);
  const eligible = games.filter(
    (game) =>
      game.status !== 'CANCELLED' && game.status !== 'SCHEDULED' && (practice || !game.isPractice),
  );
  const baseGames = eligible
    .filter((game) => gameId === 'ALL' || game.id === gameId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const scopedGames =
    period === 'ALL' ? baseGames : baseGames.map((game) => gamePeriod(game, Number(period)));
  const maxRegulation = Math.max(
    1,
    ...baseGames.map((game) => game.rules.periods),
    ...(baseGames.length ? [] : [4]),
  );
  const periodCount = Math.max(maxRegulation, ...baseGames.map((game) => game.period));
  const periods = Array.from({ length: periodCount }, (_, index) => index + 1).filter(
    (value) => period === 'ALL' || value === Number(period),
  );
  const periodName = (value: number) =>
    value <= maxRegulation ? `C${value}` : `P${value - maxRegulation}`;
  const statsRows = selectedPlayers.map((player) => ({
    player,
    stats: aggregate(scopedGames, player.id),
  }));
  const total = combineStats(statsRows.map((row) => row.stats));
  const value = (stats: Stats) => {
    const raw = stats[metric];
    return raw === null
      ? null
      : mean && !metric.includes('%') && metric !== 'Partidos'
        ? stats.Partidos
          ? raw / stats.Partidos
          : null
        : raw;
  };
  const display = (number: number | null) => formatStat(metric, number);
  const barValues = statsRows.map((row) => value(row.stats));
  const barMin = Math.min(0, ...barValues.filter((n): n is number => n !== null));
  const barMax = Math.max(0, ...barValues.filter((n): n is number => n !== null));
  const range = barMax - barMin || 1;
  const periodWindows = periods.map((quarter) =>
    baseGames.map((game) => gamePeriod(game, quarter)),
  );
  const heatRows = selectedPlayers.map((player) => ({
    player,
    cells: periodWindows.map((windows) => {
      const stats = aggregate(windows, player.id);
      return stats.Partidos ? value(stats) : null;
    }),
  }));
  const heatMax = Math.max(
    1,
    ...heatRows.flatMap((row) => row.cells.map((cell) => Math.abs(cell || 0))),
  );
  const series =
    comparison || playerId !== 'ALL'
      ? selectedPlayers.map((player, index) => ({
          name: `#${player.number} ${player.name}`,
          color: colors[index % colors.length],
          values: scopedGames.map((game) => {
            const stats = aggregate([game], player.id);
            return stats.Partidos ? value(stats) : null;
          }),
        }))
      : [
          {
            name: 'Equipo',
            color: colors[0],
            values: scopedGames.map((game) => {
              const stats = teamStats([game]);
              return stats.Partidos ? value(stats) : null;
            }),
          },
        ];
  const attempts = total.T2I + total.T3I;
  const fieldMade = total.T2A + total.T3A;
  const fieldPercent = attempts ? Math.round((fieldMade / attempts) * 100) : null;
  const quality2 = shotQuality(total.T2A, total.T2I, targets.two);
  const quality3 = shotQuality(total.T3A, total.T3I, targets.three);
  const qualityFree = shotQuality(total.T1A, total.T1I, targets.free);
  const reset = () => {
    setPlayer('ALL');
    setGame('ALL');
    setPeriod('ALL');
    setMetric('Pts');
    setMean(false);
    setPractice(includePracticeByDefault);
    setTargets({ two: 50, three: 35, free: 70 });
  };
  const hasData = statsRows.some((row) => row.stats.Partidos > 0);
  return (
    <section className="analytics-section" aria-labelledby={`${id}-heading`}>
      <header className="analytics-heading">
        <div>
          <p className="eyebrow">EXPLORA EL JUEGO</p>
          <h2 id={`${id}-heading`}>
            {comparison ? 'Comparador visual' : 'Estadísticas en gráficas'}
          </h2>
          <p>Tiro, evolución y mapas de calor con los datos de los partidos filtrados.</p>
        </div>
        <span className="analytics-game-count">
          {baseGames.length} {baseGames.length === 1 ? 'partido' : 'partidos'} ·{' '}
          {selectedPlayers.length} {selectedPlayers.length === 1 ? 'jugador' : 'jugadores'}
        </span>
      </header>
      <div className="analytics-filters" aria-label="Filtros de gráficas">
        {!comparison && (
          <label>
            Jugador de las gráficas
            <select
              aria-label="Jugador de las gráficas"
              value={playerId}
              onChange={(event) => setPlayer(event.target.value)}
            >
              <option value="ALL">Todo el equipo</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  #{player.number} {player.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Partido de las gráficas
          <select value={gameId} onChange={(event) => setGame(event.target.value)}>
            <option value="ALL">Todos los partidos filtrados</option>
            {gameId !== 'ALL' && !eligible.some((game) => game.id === gameId) && (
              <option value={gameId}>Partido fuera de los filtros actuales</option>
            )}
            {eligible.map((game) => (
              <option key={game.id} value={game.id}>
                {game.isPractice ? 'PRUEBA · ' : ''}
                {game.opponent} ·{' '}
                {new Date(game.date).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })}
              </option>
            ))}
          </select>
        </label>
        <label>
          Periodo de las gráficas
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="ALL">Todo el partido</option>
            {Array.from({ length: periodCount }, (_, index) => index + 1).map((quarter) => (
              <option key={quarter} value={quarter}>
                {quarter <= maxRegulation
                  ? `Cuarto ${quarter}`
                  : `Prórroga ${quarter - maxRegulation}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estadística a visualizar
          <select value={metric} onChange={(event) => setMetric(event.target.value as keyof Stats)}>
            {columns.map((key) => (
              <option key={key} value={key}>
                {metricLabels[key]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Escala de la métrica
          <select
            value={mean ? 'mean' : 'total'}
            onChange={(event) => setMean(event.target.value === 'mean')}
          >
            <option value="total">Totales</option>
            <option value="mean">Por partido jugado</option>
          </select>
        </label>
        <label className="analytics-practice">
          <input
            type="checkbox"
            checked={practice}
            onChange={(event) => {
              setPractice(event.target.checked);
              setGame('ALL');
            }}
          />
          Incluir simulaciones
        </label>
        <button className="analytics-reset" onClick={reset}>
          <RotateCcw size={15} />
          Restablecer gráficas
        </button>
      </div>
      <p className="analytics-context">
        <Filter size={14} />
        {metricLabels[metric]} · {mean ? 'Por partido jugado' : 'Totales'} ·{' '}
        {period === 'ALL' ? 'Todos los periodos' : periodName(Number(period))}
        {comparison ? ' · Mismos filtros para todos los jugadores comparados' : ''}
      </p>
      {!hasData && (
        <p className="analytics-empty" role="status">
          No hay acciones registradas para estos filtros. Selecciona otro partido o activa «Incluir
          simulaciones» para explorar tus pruebas.
        </p>
      )}
      <div className="analytics-grid">
        <article className="analytics-card" aria-labelledby={`${id}-shots`}>
          <div className="analytics-card-heading">
            <h3 id={`${id}-shots`}>
              <Target size={19} />
              Distribución de tiro
            </h3>
            <span>Anotados / intentados</span>
          </div>
          <div className="analytics-shot-summary">
            <div
              className="analytics-shot-ring"
              style={{ '--shot-progress': `${fieldPercent || 0}%` } as CSSProperties}
            >
              <div>
                <strong data-testid="analytics-field-percent">
                  {fieldPercent === null ? '—' : `${fieldPercent}%`}
                </strong>
                <small>Tiro de campo</small>
              </div>
            </div>
            <div>
              <strong data-testid="analytics-field-attempts">
                {fieldMade} / {attempts}
              </strong>
              <span>Canastas de 2 y de 3</span>
              <small>Los libres se muestran por separado.</small>
            </div>
          </div>
          <div className="analytics-shot-bars">
            {shots.map((shot) => {
              const made = total[shot.made],
                count = total[shot.attempts];
              return (
                <div key={shot.name}>
                  <div>
                    <strong>{shot.name}</strong>
                    <span>
                      {made} / {count} <b>{count ? `${Math.round((made / count) * 100)}%` : '—'}</b>
                    </span>
                  </div>
                  <div
                    className="analytics-shot-track"
                    data-empty={count === 0}
                    role="img"
                    aria-label={`${shot.name}: ${made} anotados de ${count} intentados`}
                  >
                    <i style={{ width: `${count ? (made / count) * 100 : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {comparison && (
            <div className="analytics-shot-comparison">
              <h4>Acierto por jugador</h4>
              <div className="analytics-heat-scroll">
                <table aria-label="Comparativa de tiro por jugador">
                  <thead>
                    <tr>
                      <th scope="col">Jugador</th>
                      {shots.map((shot) => (
                        <th scope="col" key={shot.name}>
                          {shot.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {statsRows.map(({ player, stats }) => (
                      <tr key={player.id}>
                        <th scope="row">
                          #{player.number} {player.name}
                        </th>
                        {shots.map((shot) => (
                          <td key={shot.name} data-shot={shot.name}>
                            {stats[shot.made]} / {stats[shot.attempts]}
                            <strong>
                              {stats[shot.attempts]
                                ? `${Math.round((stats[shot.made] / stats[shot.attempts]) * 100)}%`
                                : '—'}
                            </strong>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="analytics-footnote">
            <span className="legend-dot made" />
            Anotado <span className="legend-dot missed" />
            Fallado · Porcentajes ponderados por intentos.
          </p>
        </article>
        <article className="analytics-card" aria-labelledby={`${id}-court`}>
          <div className="analytics-card-heading">
            <h3 id={`${id}-court`}>
              <Flame size={19} />
              Mapa de tiro
            </h3>
            <details className="analytics-shot-targets">
              <summary>Ajustar objetivos</summary>
              <div>
                {(
                  [
                    ['two', 'Objetivo de 2 puntos'],
                    ['three', 'Objetivo de triples'],
                    ['free', 'Objetivo de libres'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <span>
                      <input
                        aria-label={label}
                        type="number"
                        min="1"
                        max="100"
                        value={targets[key]}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (value > 0 && value <= 100)
                            setTargets((previous) => ({ ...previous, [key]: value }));
                        }}
                      />
                      %
                    </span>
                  </label>
                ))}
              </div>
            </details>
          </div>
          <svg
            className="analytics-court"
            viewBox="0 0 500 360"
            role="img"
            aria-label="Mapa de tiro por zonas generales de dos y tres puntos, sin coordenadas exactas"
          >
            <title>Distribución por tipo de tiro</title>
            <rect
              x="20"
              y="20"
              width="460"
              height="320"
              rx="4"
              fill={quality3.color}
              data-testid="shot-zone-three"
              data-quality={quality3.level}
            />
            <path d="M55 20H445V60A195 195 0 0 1 55 60Z" fill="#fffefa" />
            <path
              d="M55 20H445V60A195 195 0 0 1 55 60Z"
              fill={quality2.color}
              data-testid="shot-zone-two"
              data-quality={quality2.level}
            />
            <g fill="none" stroke="#54736f" strokeWidth="2">
              <rect x="20" y="20" width="460" height="320" rx="4" />
              <path d="M55 20V60A195 195 0 0 0 445 60V20M190 20V150H310V20M220 20V75H280V20M230 43H270" />
              <circle cx="250" cy="53" r="8" />
              <path d="M190 150A60 60 0 0 0 310 150" />
              <path strokeDasharray="5 5" d="M190 150A60 60 0 0 1 310 150" />
            </g>
            <g textAnchor="middle" fill="#101d2f">
              <text x="250" y="220" fontSize="16" fontWeight="700">
                2 PUNTOS · {total.T2A}/{total.T2I}
              </text>
              <text x="250" y="242" fontSize="12">
                {total.T2I
                  ? `${Math.round((total.T2A / total.T2I) * 100)}% · ${quality2.label}`
                  : 'Sin intentos'}
              </text>
              <text x="250" y="302" fontSize="16" fontWeight="700">
                3 PUNTOS · {total.T3A}/{total.T3I}
              </text>
              <text x="250" y="323" fontSize="12">
                {total.T3I
                  ? `${Math.round((total.T3A / total.T3I) * 100)}% · ${quality3.label}`
                  : 'Sin intentos'}
              </text>
              <rect
                x="334"
                y="75"
                width="128"
                height="72"
                rx="6"
                fill={qualityFree.color}
                stroke="#778d82"
                data-testid="shot-zone-free"
                data-quality={qualityFree.level}
              />
              <text x="398" y="96" fontSize="11" fontWeight="700">
                TIROS LIBRES
              </text>
              <text x="398" y="117" fontSize="13" fontWeight="700">
                {total.T1A}/{total.T1I} ·{' '}
                {total.T1I ? `${Math.round((total.T1A / total.T1I) * 100)}%` : '—'}
              </text>
              <text x="398" y="135" fontSize="9">
                Objetivo {targets.free}%
              </text>
            </g>
          </svg>
          <div className="analytics-quality-legend" aria-label="Leyenda de acierto">
            <span>
              <i style={{ background: '#b7e4c8' }} />
              Objetivo alcanzado
            </span>
            <span>
              <i style={{ background: '#ffe09b' }} />
              Cerca del objetivo
            </span>
            <span>
              <i style={{ background: '#f4b8b2' }} />
              Por debajo
            </span>
            <span>
              <i style={{ background: '#e7ebe6' }} />
              Sin intentos
            </span>
          </div>
          <p className="analytics-footnote">
            Objetivos visuales ajustables: 2P {targets.two}%, 3P {targets.three}%, libres{' '}
            {targets.free}%. Ámbar desde el 75% del objetivo; rojo por debajo. Zonas generales por
            tipo de tiro: no se registran posiciones exactas.
          </p>
        </article>
        <article className="analytics-card analytics-wide" aria-labelledby={`${id}-trend`}>
          <div className="analytics-card-heading">
            <h3 id={`${id}-trend`}>
              <TrendingUp size={19} />
              Evolución por partido
            </h3>
            <span>{metricLabels[metric]}</span>
          </div>
          <TrendChart series={series} games={baseGames} metric={metric} display={display} />
          <div className="analytics-series-legend">
            {series.map((item) => (
              <span key={item.name}>
                <i style={{ background: item.color }} />
                {item.name}
              </span>
            ))}
          </div>
        </article>
        <article className="analytics-card" aria-labelledby={`${id}-bars`}>
          <div className="analytics-card-heading">
            <h3 id={`${id}-bars`}>
              <BarChart3 size={19} />
              Comparativa por jugador
            </h3>
            <span>{metricLabels[metric]}</span>
          </div>
          <div className="analytics-player-bars">
            {statsRows.map(({ player }, index) => {
              const number = barValues[index];
              const start = ((Math.min(number || 0, 0) - barMin) / range) * 100;
              return (
                <div key={player.id} data-testid={`analytics-bar-${player.id}`}>
                  <div>
                    <span>
                      #{player.number} {player.name}
                    </span>
                    <strong>{display(number)}</strong>
                  </div>
                  <div className="analytics-player-track">
                    <span
                      className="analytics-zero"
                      style={{ left: `${(-barMin / range) * 100}%` }}
                    />
                    <i
                      style={{
                        left: `${start}%`,
                        width: `${(Math.abs(number || 0) / range) * 100}%`,
                        background: (number || 0) < 0 ? '#b46822' : colors[index % colors.length],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
        <article className="analytics-card" aria-labelledby={`${id}-matrix`}>
          <div className="analytics-card-heading">
            <h3 id={`${id}-matrix`}>
              <Flame size={19} />
              Mapa de calor por cuartos
            </h3>
            <span>{metricLabels[metric]}</span>
          </div>
          <div
            className="analytics-heat-scroll"
            tabIndex={0}
            role="region"
            aria-label="Mapa de calor por jugador y periodo"
          >
            <table
              className="analytics-heatmap"
              aria-label={`Mapa de calor: ${metricLabels[metric]}`}
            >
              <thead>
                <tr>
                  <th scope="col">Jugador</th>
                  {periods.map((quarter) => (
                    <th scope="col" key={quarter}>
                      {periodName(quarter)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatRows.map(({ player, cells }) => (
                  <tr key={player.id}>
                    <th scope="row">
                      #{player.number} {player.name}
                    </th>
                    {cells.map((number, index) => (
                      <td
                        key={periods[index]}
                        title={`${player.name} · ${periodName(periods[index])} · ${metricLabels[metric]}: ${display(number)}`}
                        style={{
                          background:
                            number === null
                              ? '#f0f1ed'
                              : `rgba(${number < 0 ? '180,104,34' : '0,148,157'},${0.07 + (Math.abs(number) / heatMax) * 0.65})`,
                          color:
                            number !== null && Math.abs(number) / heatMax > 0.7
                              ? '#fff'
                              : '#263b42',
                        }}
                      >
                        {display(number)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="analytics-footnote">
            <span className="analytics-heat-gradient" />
            Mayor intensidad = mayor valor absoluto. Naranja: valores negativos. —: sin
            participación o sin intentos. C: cuarto; P: prórroga.
          </p>
        </article>
      </div>
      <details className="analytics-data">
        <summary>Ver datos de las gráficas</summary>
        <div className="analytics-heat-scroll">
          <table>
            <caption>{metricLabels[metric]} · datos por partido</caption>
            <thead>
              <tr>
                <th scope="col">Partido</th>
                {series.map((item) => (
                  <th scope="col" key={item.name}>
                    {item.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {baseGames.map((game, index) => (
                <tr key={game.id}>
                  <th scope="row">
                    {new Date(game.date).toLocaleDateString('es-ES')} · {game.opponent}
                  </th>
                  {series.map((item) => (
                    <td key={item.name}>{display(item.values[index])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function TrendChart({
  series,
  games,
  metric,
  display,
}: {
  series: { name: string; color: string; values: (number | null)[] }[];
  games: Game[];
  metric: keyof Stats;
  display: (value: number | null) => string;
}) {
  const values = series.flatMap((item) =>
    item.values.filter((value): value is number => value !== null),
  );
  const min = Math.min(0, ...values),
    max = Math.max(metric.includes('%') ? 100 : 1, ...values),
    span = max - min || 1;
  const x = (index: number) => (games.length < 2 ? 370 : 65 + (index / (games.length - 1)) * 625);
  const y = (value: number) => 200 - ((value - min) / span) * 170;
  return (
    <svg
      className="analytics-trend"
      viewBox="0 0 740 250"
      role="img"
      aria-label={`Evolución de ${metricLabels[metric]} por partido`}
    >
      <title>Evolución de {metricLabels[metric]}</title>
      {[0, 1, 2, 3, 4].map((index) => {
        const value = min + (span * index) / 4;
        return (
          <g key={index}>
            <line x1="65" x2="690" y1={y(value)} y2={y(value)} stroke="#dfe6df" />
            <text x="54" y={y(value) + 4} textAnchor="end" fontSize="10" fill="#657571">
              {display(value)}
            </text>
          </g>
        );
      })}
      {min < 0 && (
        <line x1="65" x2="690" y1={y(0)} y2={y(0)} stroke="#607f7b" strokeDasharray="3 3" />
      )}
      {games
        .filter((_, index) => index === 0 || index === games.length - 1 || games.length <= 8)
        .map((game) => {
          const index = games.indexOf(game);
          return (
            <text
              key={game.id}
              x={x(index)}
              y="227"
              textAnchor="middle"
              fontSize="10"
              fill="#657571"
            >
              {new Date(game.date).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                timeZone: 'Europe/Madrid',
              })}
            </text>
          );
        })}
      {series.map((item, seriesIndex) => {
        let previous = false;
        const path = item.values
          .map((value, index) => {
            if (value === null) {
              previous = false;
              return '';
            }
            const command = previous ? 'L' : 'M';
            previous = true;
            return `${command}${x(index)},${y(value)}`;
          })
          .join(' ');
        return (
          <g key={item.name}>
            <path
              d={path}
              fill="none"
              stroke={item.color}
              strokeWidth="3"
              strokeDasharray={seriesIndex ? `${8 - seriesIndex} ${seriesIndex + 2}` : undefined}
            />
            {item.values.map((value, index) =>
              value === null ? null : (
                <circle
                  key={games[index].id}
                  cx={x(index)}
                  cy={y(value)}
                  r={5 + seriesIndex * 2}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="2"
                >
                  <title>
                    {item.name} · {games[index].opponent}: {display(value)}
                  </title>
                </circle>
              ),
            )}
          </g>
        );
      })}
      {!games.length && (
        <text x="370" y="120" textAnchor="middle" fontSize="13" fill="#657571">
          Sin partidos para estos filtros
        </text>
      )}
    </svg>
  );
}
