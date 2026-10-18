'use client';
import { useEffect, useRef, useState, type FormEvent, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import {
  Play,
  Pause,
  Undo2,
  ArrowLeftRight,
  Check,
  ChevronRight,
  ChevronDown,
  FlaskConical,
  Clock3,
  Settings2,
  RotateCcw,
  Wifi,
  CloudUpload,
  Keyboard,
  X,
  Plus,
  Users,
  ArrowRight,
  Target,
  ShieldCheck,
  BarChart3,
  GripVertical,
} from 'lucide-react';
import { actions, type Action, type Game, type Player } from '@/domain/basketball/types';
import { reduceGameEvents } from '@/domain/basketball/stats';
import PlayerPortrait from '../player-portrait';
import LiveMatchStats from './live-match-stats';
import type { PendingCommand } from './use-command-queue';
type Props = {
  teamName: string;
  onBack: () => void;
  game?: Game;
  games: Game[];
  players: Player[];
  selected: string;
  onSelect: (id: string) => void;
  onGame: (id: string) => void;
  clock: number;
  running: boolean;
  onClock: (running: boolean) => void;
  onAdjust: (seconds: number) => Promise<void>;
  send: (action: string, payload: Record<string, unknown>, gameId?: string) => Promise<boolean>;
  canScore: boolean;
  canManage: boolean;
  busy: boolean;
  pending: PendingCommand[];
  syncError: string;
  onRetry: () => void;
  onReview: (kind: 'finalize' | 'reopen') => void;
  demo: boolean;
};
const clockText = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`;
const names: Record<string, string> = {
  SHOT_2_MADE: 'Canasta de 2',
  SHOT_2_MISSED: 'Tiro de 2 fallado',
  SHOT_3_MADE: 'Triple',
  SHOT_3_MISSED: 'Triple fallado',
  FREE_THROW_MADE: 'Tiro libre',
  FREE_THROW_MISSED: 'Libre fallado',
  OPPONENT_SCORE: 'Puntos del rival',
  LINEUP_SET: 'Quinteto inicial',
  SUBSTITUTION: 'Cambio de jugadores',
  ...Object.fromEntries(
    Object.entries(actions).filter(([k]) => !k.includes('SHOT') && !k.includes('THROW')),
  ),
};
const shortcuts: Record<string, Action> = {
  q: 'SHOT_2_MADE',
  w: 'SHOT_2_MISSED',
  e: 'SHOT_3_MADE',
  r: 'SHOT_3_MISSED',
  t: 'FREE_THROW_MADE',
  y: 'FREE_THROW_MISSED',
  a: 'ASSIST',
  d: 'DEF_REBOUND',
  o: 'OFF_REBOUND',
  p: 'TURNOVER',
  f: 'FOUL_COMMITTED',
};
export default function LiveScorer(p: Props) {
  const touchDrag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(0);
  const nativeDrag = useRef('');
  const emptyDragImage = useRef<HTMLSpanElement>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState('');
  const [dropTarget, setDropTarget] = useState('');
  const [advancing, setAdvancing] = useState(false);
  const [step, setStep] = useState(0),
    [roster, setRoster] = useState<string[]>([]),
    [starters, setStarters] = useState<string[]>([]),
    [swapping, setSwapping] = useState(false),
    [out, setOut] = useState(''),
    [incoming, setIncoming] = useState(''),
    [showClock, setShowClock] = useState(false),
    [feedback, setFeedback] = useState(''),
    [order, setOrder] = useState<'player' | 'action'>('player'),
    [chosen, setChosen] = useState<Action | null>(null),
    [timeline, setTimeline] = useState(false);
  useEffect(() => {
    setStep(0);
    nativeDrag.current = '';
    touchDrag.current = null;
    setDragging('');
    setDropTarget('');
    setDragPosition(null);
    setRoster(p.game?.roster || p.players.filter((x) => x.active).map((x) => x.id));
    setStarters(p.game ? reduceGameEvents(p.game).lineup : []);
    setSwapping(false);
    setOut('');
    setIncoming('');
    setChosen(null);
    setFeedback('');
  }, [p.game?.id]);
  useEffect(() => {
    const saved = localStorage.getItem('cdir-scorer-order');
    if (saved === 'action' || saved === 'player') setOrder(saved);
  }, []);
  useEffect(() => {
    if (!dragging) return;
    const move = (event: DragEvent) => {
      if (nativeDrag.current && (event.clientX || event.clientY))
        setDragPosition({ x: event.clientX, y: event.clientY });
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        nativeDrag.current = '';
        touchDrag.current = null;
        setDragging('');
        setDropTarget('');
        setDragPosition(null);
        suppressClick.current = Date.now() + 400;
      }
    };
    document.addEventListener('dragover', move);
    document.addEventListener('keydown', cancel);
    return () => {
      document.removeEventListener('dragover', move);
      document.removeEventListener('keydown', cancel);
    };
  }, [dragging]);
  const game = p.game;
  // Pending actions are shown immediately but explicitly labelled as awaiting server confirmation.
  const optimistic = game ? structuredClone(game) : undefined;
  if (optimistic)
    for (const item of p.pending.filter((x) => x.gameId === game?.id && x.action === 'event')) {
      if (optimistic.events.some((e) => e.mutationId === item.mutationId)) continue;
      const remaining = Number(item.payload.remaining ?? optimistic.remaining);
      optimistic.elapsed += Math.max(0, optimistic.remaining - remaining);
      optimistic.remaining = remaining;
      optimistic.events.push({
        id: item.mutationId,
        mutationId: item.mutationId,
        sequence: optimistic.events.length + 1,
        type: item.payload.type as Action,
        playerId: item.payload.playerId as string | undefined,
        points: item.payload.points as number | undefined,
        period: optimistic.period,
        remaining,
        elapsed: optimistic.elapsed,
        createdBy: 'pendiente',
        createdAt: new Date().toISOString(),
      });
    }
  const live = optimistic ? reduceGameEvents(optimistic) : null;
  const selected = p.players.find((player) => player.id === p.selected);
  const active = game?.status === 'LIVE';
  const locked = !p.canScore || !!p.syncError;
  const record = async (
    type: Action | 'OPPONENT_SCORE',
    points?: number,
    playerId = p.selected,
  ) => {
    if (!game || locked) return;
    const person = p.players.find((x) => x.id === playerId);
    const label = `${type === 'OPPONENT_SCORE' ? 'Rival' : `#${person?.number} ${person?.name.split(' ')[0]}`} · ${names[type]}${type === 'OPPONENT_SCORE' ? ` +${points}` : ''}`;
    setFeedback(label);
    setChosen(null);
    const ok = await p.send(
      'event',
      { type, remaining: p.clock, ...(type === 'OPPONENT_SCORE' ? { points } : { playerId }) },
      game.id,
    );
    if (!ok) setFeedback('Acción rechazada. Revisa el aviso.');
  };
  const pickPlayer = (id: string) => {
    p.onSelect(id);
    if (order === 'action' && chosen) void record(chosen, undefined, id);
  };
  const pickAction = (action: Action) => {
    if (order === 'action') {
      setChosen(action);
      return;
    }
    if (p.selected) void record(action);
  };
  const last = game
    ? [...game.events]
        .reverse()
        .find((e) => !e.voided && e.type !== 'LINEUP_SET' && e.type !== 'SUBSTITUTION')
    : undefined;
  const undo = () => {
    if (last && !p.busy)
      void p
        .send('undo', { eventId: last.id, reason: 'Deshacer rápido desde el anotador' }, game?.id)
        .then((ok) => {
          if (ok) setFeedback('Última acción anulada · marcador recalculado');
        });
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        !active ||
        locked ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target as HTMLElement)?.closest('input,select,textarea,dialog,[contenteditable=true]')
      )
        return;
      if (/^[1-5]$/.test(e.key)) {
        e.preventDefault();
        const id = live?.lineup[Number(e.key) - 1];
        if (id) {
          if (swapping) {
            if (incoming) change(incoming, id);
            else setOut(id);
          } else pickPlayer(id);
        }
      } else if (shortcuts[e.key.toLowerCase()]) {
        e.preventDefault();
        pickAction(shortcuts[e.key.toLowerCase()]);
      } else if (e.code === 'Space') {
        e.preventDefault();
        p.onClock(!p.running);
      } else if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'Escape') setChosen(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  const start = async () => {
    if (await p.send('prepare', { roster, lineup: starters }, game?.id)) {
      p.onSelect('');
      setFeedback('Partido preparado. Selecciona un dorsal y toca una acción.');
    }
  };
  const change = (incoming: string, outgoing = out) => {
    if (!game || !live || !outgoing) return;
    const lineup = live.lineup.map((id) => (id === outgoing ? incoming : id));
    void p.send('lineup', { lineup, remaining: p.clock }, game.id).then((ok) => {
      if (ok) {
        p.onSelect(incoming);
        setSwapping(false);
        setOut('');
        setIncoming('');
        setFeedback('Cambio guardado. El nuevo jugador está seleccionado.');
      }
    });
  };
  const canSwap = (source: string, target: string) =>
    !!live &&
    source !== target &&
    game?.roster.includes(source) &&
    game.roster.includes(target) &&
    live.lineup.includes(source) !== live.lineup.includes(target);
  const dropPlayer = (source: string, target: string) => {
    if (locked || p.busy || !canSwap(source, target) || !live) return;
    change(
      live.lineup.includes(source) ? target : source,
      live.lineup.includes(source) ? source : target,
    );
  };
  const clearDrag = () => {
    nativeDrag.current = '';
    touchDrag.current = null;
    setDragging('');
    setDropTarget('');
    setDragPosition(null);
  };
  const targetAt = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-player-id]')?.dataset.playerId ||
    '';
  const dragCard = (id: string): HTMLAttributes<HTMLButtonElement> => ({
    draggable: !locked && !p.busy,
    title: p.busy
      ? 'Esperando a que termine el guardado'
      : 'Arrastra esta tarjeta sobre un jugador del otro grupo para hacer un cambio',
    onDragStart: (event) => {
      if (locked || p.busy || touchDrag.current) {
        event.preventDefault();
        return;
      }
      nativeDrag.current = id;
      event.dataTransfer.setData('application/x-cdir-player', id);
      event.dataTransfer.effectAllowed = 'move';
      if (emptyDragImage.current) event.dataTransfer.setDragImage(emptyDragImage.current, 0, 0);
      setDragging(id);
      setChosen(null);
      setDragPosition({ x: event.clientX, y: event.clientY });
    },
    onDragOver: (event) => {
      if (!nativeDrag.current || !canSwap(nativeDrag.current, id) || locked || p.busy) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget(id);
      setDragPosition({ x: event.clientX, y: event.clientY });
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget('');
    },
    onDrop: (event) => {
      if (!nativeDrag.current) return;
      event.preventDefault();
      const source = nativeDrag.current;
      suppressClick.current = Date.now() + 500;
      dropPlayer(source, id);
      clearDrag();
    },
    onDragEnd: () => {
      suppressClick.current = Date.now() + 500;
      clearDrag();
    },
    onPointerDown: (event) => {
      if (event.pointerType === 'mouse' || locked || p.busy || !event.isPrimary) return;
      touchDrag.current = { id, x: event.clientX, y: event.clientY, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event) => {
      const touch = touchDrag.current;
      if (!touch) return;
      if (!touch.moved && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < 8) return;
      touch.moved = true;
      setDragging(touch.id);
      setChosen(null);
      setDragPosition({ x: event.clientX, y: event.clientY });
      const target = targetAt(event.clientX, event.clientY);
      setDropTarget(canSwap(touch.id, target) ? target : '');
    },
    onPointerUp: (event) => {
      const touch = touchDrag.current;
      if (!touch) return;
      if (touch.moved) {
        suppressClick.current = Date.now() + 500;
        dropPlayer(touch.id, targetAt(event.clientX, event.clientY));
      }
      clearDrag();
    },
    onPointerCancel: () => {
      if (touchDrag.current) clearDrag();
    },
  });
  const nextPeriod = async () => {
    if (!game || p.running || p.busy || advancing || locked) return;
    setAdvancing(true);
    try {
      if (
        p.clock !== 0 &&
        (!game.isPractice || !(await p.send('clock', { remaining: 0 }, game.id)))
      )
        return;
      if (game.period >= game.rules.periods && live && live.ours !== live.opponent) {
        setFeedback(
          'Tiempo terminado. Puedes finalizar el partido desde las herramientas del acta.',
        );
        return;
      }
      if (await p.send('period', {}, game.id))
        setFeedback('Nuevo periodo. El reloj está parado: pulsa Iniciar reloj cuando estés listo.');
    } finally {
      setAdvancing(false);
    }
  };
  const practice = () => void p.send('practice', {});
  if (!game || !live)
    return (
      <section className="live-welcome">
        <span className="live-icon">
          <Target size={28} />
        </span>
        <h2>Aprende en una jugada.</h2>
        <p>
          Abre un partido desde el calendario o practica con tu plantilla. Las pruebas no cuentan en
          la temporada.
        </p>
        <button className="primary" disabled={p.busy || !p.canScore} onClick={practice}>
          <FlaskConical size={18} />
          Probar en 1 clic
        </button>
      </section>
    );
  return (
    <div className="live-console">
      <span ref={emptyDragImage} className="empty-player-drag-image" aria-hidden="true" />
      {dragging &&
        dragPosition &&
        (() => {
          const player = p.players.find((person) => person.id === dragging);
          const target = p.players.find((person) => person.id === dropTarget);
          if (!player) return null;
          return createPortal(
            <div className="live-player-drag-layer" aria-hidden="true">
              <div
                className={`live-player-drag-preview ${target ? 'ready' : ''}`}
                data-testid="player-drag-preview"
                style={{
                  left: Math.max(8, Math.min(dragPosition.x + 18, window.innerWidth - 208)),
                  top: Math.max(8, Math.min(dragPosition.y - 40, window.innerHeight - 130)),
                }}
              >
                <PlayerPortrait player={player} />
                <div>
                  <strong>{player.name}</strong>
                  <small>
                    #{player.number} ·{' '}
                    {live.lineup.includes(player.id) ? 'Sale de pista' : 'Entra a pista'}
                  </small>
                  <span>
                    {target ? `Cambiar por #${target.number}` : 'Arrastra sobre el otro jugador'}
                  </span>
                </div>
                <GripVertical size={18} />
              </div>
              <div
                className={`live-player-drop-instruction ${target ? 'ready' : ''}`}
                role="presentation"
              >
                {target
                  ? `Suelta para cambiar #${player.number} por #${target.number}`
                  : live.lineup.includes(player.id)
                    ? 'Suelta sobre un jugador del banquillo'
                    : 'Suelta sobre el titular que va a salir'}
              </div>
            </div>,
            document.body,
          );
        })()}
      <span className="sr-only" role="status">
        {dragging
          ? dropTarget
            ? 'Destino válido. Suelta para realizar el cambio.'
            : 'Arrastrando jugador. Elige un jugador del otro grupo.'
          : ''}
      </span>
      <div className="live-intro">
        <p className="eyebrow">CDIR / MESA DE ANOTACIÓN</p>
        <h1>Directo, sin distracciones.</h1>
      </div>
      <div className="live-toolbar">
        <button className="match-back-button" disabled={p.running || p.busy} onClick={p.onBack}>
          <ArrowRight size={16} />
          Volver a partidos
        </button>
        <strong className="current-match-name">
          {p.teamName} · {game.opponent}
        </strong>
        <button
          className="practice-link"
          disabled={p.busy || p.running || !p.canScore}
          onClick={practice}
        >
          <FlaskConical size={16} />
          {game.isPractice ? 'Nueva prueba' : 'Probar en 1 clic'}
        </button>
      </div>
      {game.isPractice && (
        <div className="practice-banner">
          <FlaskConical size={17} />
          <strong>PARTIDO DE PRUEBA</strong>
          <span>Practica sin alterar las estadísticas oficiales.</span>
        </div>
      )}
      <section className="live-score-strip" aria-label="Marcador del partido">
        <div className="live-score-team">
          <span>{p.teamName}</span>
          <strong data-testid="score-ours">{live.ours}</strong>
        </div>
        <div className="live-clock-center">
          <span className="live-period" data-testid="live-period">
            {game.status === 'SCHEDULED'
              ? 'PREPARACIÓN'
              : game.status === 'FINAL'
                ? 'FINALIZADO'
                : game.period > game.rules.periods
                  ? `PRÓRROGA ${game.period - game.rules.periods}`
                  : `CUARTO ${game.period} / ${game.rules.periods}`}
          </span>
          <strong data-testid="live-clock">{clockText(p.clock)}</strong>
          {active && p.canScore ? (
            <button
              className={p.running ? 'clock-control running' : 'clock-control'}
              aria-keyshortcuts="Space"
              onClick={() => p.onClock(!p.running)}
              disabled={!!p.syncError}
            >
              {p.running ? <Pause size={17} /> : <Play size={17} />}
              <span>{p.running ? 'Parar reloj' : 'Iniciar reloj'}</span>
            </button>
          ) : (
            <span className="score-state">
              {game.status === 'SCHEDULED' ? 'Confirma tus cinco titulares' : 'Acta cerrada'}
            </span>
          )}
        </div>
        <div className="live-rival-area">
          <div className="live-score-team rival">
            <span>{game.opponent}</span>
            <strong data-testid="score-opponent">{live.opponent}</strong>
          </div>
          {active && (
            <div className="score-rival-controls" aria-label="Sumar puntos al rival">
              {[1, 2, 3].map((points) => (
                <button
                  key={points}
                  disabled={locked || swapping}
                  aria-label={`Rival más ${points}`}
                  onClick={() => record('OPPONENT_SCORE', points)}
                >
                  +{points}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
      {active && (
        <div className="live-period-controls">
          <span>
            {game.period <= game.rules.periods
              ? `Cuarto ${game.period} de ${game.rules.periods}`
              : `Prórroga ${game.period - game.rules.periods}`}
          </span>
          <button
            className="secondary"
            disabled={
              p.running ||
              p.busy ||
              advancing ||
              locked ||
              (!game.isPractice && p.clock !== 0) ||
              (game.period >= game.rules.periods &&
                live.ours !== live.opponent &&
                (!game.isPractice || p.clock === 0))
            }
            onClick={nextPeriod}
          >
            {advancing
              ? 'Cambiando…'
              : game.isPractice && p.clock > 0
                ? game.period >= game.rules.periods && live.ours !== live.opponent
                  ? 'Simular fin del partido'
                  : 'Simular fin de cuarto'
                : game.period >= game.rules.periods
                  ? 'Iniciar prórroga'
                  : 'Siguiente cuarto'}
            <ChevronRight size={16} />
          </button>
          {game.isPractice && <small>En la simulación puedes avanzar sin esperar al reloj.</small>}
        </div>
      )}
      <div className={`live-sync ${p.syncError ? 'failed' : ''}`} role="status">
        {p.syncError ? (
          <>
            <CloudUpload size={15} />
            <strong>Guardado pendiente</strong>
            <span>Revisa el aviso. Conservamos la cola mientras esta página esté abierta.</span>
            <button onClick={p.onRetry}>
              <RotateCcw size={14} />
              Reintentar guardado
            </button>
          </>
        ) : p.pending.length ? (
          <>
            <CloudUpload size={15} />
            <strong>
              {p.pending.length}{' '}
              {p.pending.length === 1 ? 'acción pendiente' : 'acciones pendientes'}
            </strong>
            <span>El marcador incluye los cambios pendientes.</span>
          </>
        ) : (
          <>
            <ShieldCheck size={15} />
            <strong>Todo guardado</strong>
            <span>{p.demo ? 'Servidor local de demostración' : 'MongoDB'}</span>
          </>
        )}
      </div>
      {game.status === 'SCHEDULED' ? (
        <section className="live-setup">
          <div className="setup-heading">
            <div>
              <p className="eyebrow">ANTES DEL SALTO INICIAL</p>
              <h2>Tu partido, listo en dos pasos.</h2>
            </div>
            <span>{step + 1} / 2</span>
          </div>
          <div className="setup-steps">
            <button className={step === 0 ? 'active' : ''} onClick={() => setStep(0)}>
              <span>{step > 0 ? <Check size={15} /> : 1}</span>Convocados{' '}
              <small>{roster.length}</small>
            </button>
            <button
              className={step === 1 ? 'active' : ''}
              disabled={roster.length < 5}
              onClick={() => setStep(1)}
            >
              <span>2</span>Cinco titulares <small>{starters.length}/5</small>
            </button>
          </div>
          {step === 0 ? (
            <>
              <div className="setup-copy">
                <h3>¿Quién juega hoy?</h3>
                <p>Marca a los jugadores disponibles. Necesitas al menos cinco.</p>
                <button
                  className="text-button"
                  onClick={() => setRoster(p.players.filter((x) => x.active).map((x) => x.id))}
                >
                  Convocar a todos
                </button>
              </div>
              <div className="setup-player-grid">
                {p.players
                  .filter((x) => x.active || game.roster.includes(x.id))
                  .map((player) => (
                    <button
                      aria-pressed={roster.includes(player.id)}
                      key={player.id}
                      className={roster.includes(player.id) ? 'picked' : ''}
                      onClick={() => {
                        setRoster(
                          roster.includes(player.id)
                            ? roster.filter((id) => id !== player.id)
                            : [...roster, player.id],
                        );
                        setStarters(starters.filter((id) => id !== player.id));
                      }}
                    >
                      <PlayerPortrait player={player} />
                      <span>{player.name}</span>
                      {roster.includes(player.id) && <Check size={16} />}
                    </button>
                  ))}
              </div>
              <div className="setup-footer">
                <span>{roster.length} convocados</span>
                <button className="primary" disabled={roster.length < 5} onClick={() => setStep(1)}>
                  Elegir titulares <ArrowRight size={17} />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="setup-copy">
                <h3>Elige tus cinco iniciales.</h3>
                <p>
                  Toca los dorsales que empiezan en pista. Podrás cambiarlos durante el partido.
                </p>
                <button className="text-button" onClick={() => setStarters(roster.slice(0, 5))}>
                  Seleccionar primeros cinco
                </button>
              </div>
              <div className="setup-player-grid starters">
                {p.players
                  .filter((x) => roster.includes(x.id))
                  .map((player) => (
                    <button
                      aria-pressed={starters.includes(player.id)}
                      key={player.id}
                      className={starters.includes(player.id) ? 'picked' : ''}
                      disabled={!starters.includes(player.id) && starters.length === 5}
                      onClick={() =>
                        setStarters(
                          starters.includes(player.id)
                            ? starters.filter((id) => id !== player.id)
                            : [...starters, player.id],
                        )
                      }
                    >
                      <PlayerPortrait player={player} />
                      <span>{player.name}</span>
                      {starters.includes(player.id) && <Check size={16} />}
                    </button>
                  ))}
              </div>
              <div className="setup-footer">
                <button className="secondary" onClick={() => setStep(0)}>
                  Volver
                </button>
                <button
                  className="primary start-match"
                  disabled={starters.length !== 5 || p.busy || !p.canScore}
                  onClick={start}
                >
                  <Play size={18} />
                  Comenzar partido con estos 5
                </button>
              </div>
            </>
          )}
          <aside className="setup-tip">
            <FlaskConical size={20} />
            <div>
              <strong>¿Quieres familiarizarte antes?</strong>
              <p>
                Abre una prueba con cinco jugadores ya preparados. Tu partido real seguirá sin
                empezar.
              </p>
            </div>
            <button onClick={practice} disabled={p.busy || !p.canScore}>
              Practicar ahora <ArrowUpRightIcon />
            </button>
          </aside>
        </section>
      ) : (
        <>
          {active && (
            <>
              <a className="live-stats-jump" href="#live-match-stats">
                <BarChart3 size={16} />
                Ver estadísticas del partido
                <ChevronDown size={15} />
              </a>
              <div className="capture-options">
                <div className="capture-hint">
                  <span className="live-dot" />{' '}
                  {p.running ? 'Reloj en marcha' : 'Reloj parado · puedes registrar acciones'}
                </div>
                <div className="order-picker" aria-label="Orden de captura">
                  <button
                    aria-pressed={order === 'player'}
                    className={order === 'player' ? 'active' : ''}
                    onClick={() => {
                      setOrder('player');
                      setChosen(null);
                      localStorage.setItem('cdir-scorer-order', 'player');
                    }}
                  >
                    Jugador → acción
                  </button>
                  <button
                    aria-pressed={order === 'action'}
                    className={order === 'action' ? 'active' : ''}
                    onClick={() => {
                      setOrder('action');
                      setChosen(null);
                      localStorage.setItem('cdir-scorer-order', 'action');
                    }}
                  >
                    Acción → jugador
                  </button>
                </div>
              </div>
              <div className="live-capture-grid">
                <section className="live-players">
                  <div className="capture-section-heading">
                    <h2>
                      <span>{order === 'player' ? 1 : 2}</span>
                      {swapping ? 'Quinteto · ¿quién sale?' : 'Quinteto'}
                    </h2>
                    <button
                      disabled={p.busy || locked}
                      className={swapping ? 'change-button active' : 'change-button'}
                      onClick={() => {
                        setSwapping(!swapping);
                        setOut('');
                        setIncoming('');
                      }}
                    >
                      <ArrowLeftRight size={16} />
                      {swapping ? 'Cancelar cambio' : 'Cambio'}
                    </button>
                  </div>
                  <p className="capture-instruction">
                    {swapping
                      ? incoming
                        ? 'Toca al jugador en pista que va a salir.'
                        : 'Toca primero a quien sale. Después, a quien entra.'
                      : chosen
                        ? `${names[chosen]}. Toca el dorsal del jugador.`
                        : 'Toca un jugador para anotar. Coge una tarjeta y suéltala sobre un suplente para cambiarlo.'}
                  </p>
                  <div className="live-five">
                    {live.lineup.map((id, i) => {
                      const player = p.players.find((x) => x.id === id)!;
                      return (
                        <button
                          key={id}
                          {...dragCard(id)}
                          data-player-id={id}
                          data-dragging={dragging === id}
                          data-drop-target={dropTarget === id}
                          data-can-drop={!!dragging && !!canSwap(dragging, id)}
                          aria-label={`Seleccionar ${player.name}, dorsal ${player.number}`}
                          aria-pressed={swapping ? out === id : p.selected === id}
                          disabled={locked}
                          onClick={() => {
                            if (Date.now() < suppressClick.current) return;
                            if (swapping) {
                              if (incoming) change(incoming, id);
                              else setOut(id);
                            } else pickPlayer(id);
                          }}
                          className={(swapping ? out === id : p.selected === id) ? 'selected' : ''}
                        >
                          <GripVertical
                            className="player-drag-handle"
                            size={15}
                            aria-hidden="true"
                          />
                          <span className="player-key">{i + 1}</span>
                          <PlayerPortrait player={player} />
                          <span className="live-player-name">{player.name}</span>
                          <small>{live.stats[id]?.Pts || 0} PTS</small>
                          {(swapping ? out === id : p.selected === id) && (
                            <Check className="selected-check" size={16} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {
                    <div className="live-bench">
                      <h3>
                        {swapping
                          ? out
                            ? 'Ahora, ¿quién entra?'
                            : 'Selecciona un jugador en pista'
                          : 'En el banquillo'}
                      </h3>
                      {!swapping && (
                        <p>
                          Arrastra sobre un jugador del quinteto, o toca quién entra y quién sale.
                        </p>
                      )}
                      {game.roster
                        .filter((id) => !live.lineup.includes(id))
                        .map((id) => {
                          const player = p.players.find((x) => x.id === id)!;
                          return (
                            <button
                              key={id}
                              {...dragCard(id)}
                              data-player-id={id}
                              data-dragging={dragging === id}
                              data-drop-target={dropTarget === id}
                              data-can-drop={!!dragging && !!canSwap(dragging, id)}
                              disabled={p.busy || locked}
                              aria-label={`Dar entrada a ${player.name}, dorsal ${player.number}`}
                              aria-pressed={incoming === id}
                              onClick={() => {
                                if (Date.now() < suppressClick.current) return;
                                if (out) change(id);
                                else {
                                  setSwapping(true);
                                  setIncoming(id);
                                  setChosen(null);
                                }
                              }}
                            >
                              <GripVertical
                                className="player-drag-handle"
                                size={14}
                                aria-hidden="true"
                              />
                              <PlayerPortrait player={player} />
                              <span>{player.name}</span>
                              <Plus size={16} />
                            </button>
                          );
                        })}
                    </div>
                  }
                  <div className="live-last-action" aria-live="polite">
                    <Check size={17} />
                    <div>
                      <strong>{feedback || 'Todo listo para la siguiente jugada.'}</strong>
                      <small>
                        {p.pending.length
                          ? 'Pendiente de confirmar en servidor'
                          : last
                            ? `${names[last.type] || last.type} · cuarto ${last.period} · ${clockText(last.remaining)}`
                            : 'Selecciona un dorsal para empezar.'}
                      </small>
                    </div>
                  </div>
                  <button
                    className="quick-undo"
                    aria-keyshortcuts="Z"
                    disabled={!last || p.busy || locked}
                    onClick={undo}
                  >
                    <Undo2 size={19} />
                    <span>
                      Deshacer última acción<small>Un toque · con registro de corrección</small>
                    </span>
                    <kbd>Z</kbd>
                  </button>
                </section>
                <section className="live-actions">
                  <div className="capture-section-heading">
                    <h2>
                      <span>{order === 'player' ? 2 : 1}</span>¿Qué ha pasado?
                    </h2>
                    <span className="action-mode">CAPTURA RÁPIDA</span>
                  </div>
                  <div className={`selected-player-strip ${chosen ? 'pending-action' : ''}`}>
                    {chosen ? (
                      <>
                        <Target size={18} />
                        <strong>{names[chosen]}</strong>
                        <span>Ahora toca un jugador</span>
                        <button
                          aria-label="Cancelar acción seleccionada"
                          onClick={() => setChosen(null)}
                        >
                          <X size={17} />
                        </button>
                      </>
                    ) : selected && live.lineup.includes(selected.id) ? (
                      <>
                        <PlayerPortrait player={selected} />
                        <strong>{selected.name}</strong>
                        <span>Seleccionado</span>
                      </>
                    ) : (
                      <>
                        <Users size={18} />
                        <strong>
                          {order === 'action' ? 'Elige una acción' : 'Selecciona un dorsal'}
                        </strong>
                        <span>
                          {order === 'action' ? 'Después, el jugador' : 'Arriba / a la izquierda'}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="shot-pad">
                    <div className="shot-pad-labels">
                      <span>TIRO</span>
                      <span>DENTRO ✓</span>
                      <span>FUERA ×</span>
                    </div>
                    {[
                      {
                        value: 2,
                        name: '2 puntos',
                        made: 'SHOT_2_MADE',
                        missed: 'SHOT_2_MISSED',
                        keys: ['Q', 'W'],
                      },
                      {
                        value: 3,
                        name: '3 puntos',
                        made: 'SHOT_3_MADE',
                        missed: 'SHOT_3_MISSED',
                        keys: ['E', 'R'],
                      },
                      {
                        value: 1,
                        name: 'Tiro libre',
                        made: 'FREE_THROW_MADE',
                        missed: 'FREE_THROW_MISSED',
                        keys: ['T', 'Y'],
                      },
                    ].map((row) => (
                      <div className="shot-pad-row" key={row.value}>
                        <div>
                          <strong>{row.value}</strong>
                          <span>{row.name}</span>
                        </div>
                        <button
                          aria-label={actions[row.made as Action]}
                          className={`shot-made ${chosen === row.made ? 'chosen' : ''}`}
                          disabled={
                            locked ||
                            swapping ||
                            (order === 'player' && !live.lineup.includes(p.selected))
                          }
                          onClick={() => pickAction(row.made as Action)}
                        >
                          <span>+{row.value}</span>
                          <Check size={21} />
                          <kbd>{row.keys[0]}</kbd>
                        </button>
                        <button
                          aria-label={actions[row.missed as Action]}
                          className={`shot-missed ${chosen === row.missed ? 'chosen' : ''}`}
                          disabled={
                            locked ||
                            swapping ||
                            (order === 'player' && !live.lineup.includes(p.selected))
                          }
                          onClick={() => pickAction(row.missed as Action)}
                        >
                          <X size={24} />
                          <span>Fallo</span>
                          <kbd>{row.keys[1]}</kbd>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="other-actions">
                    {(
                      [
                        'DEF_REBOUND',
                        'OFF_REBOUND',
                        'ASSIST',
                        'STEAL',
                        'TURNOVER',
                        'FOUL_COMMITTED',
                      ] as Action[]
                    ).map((action) => (
                      <button
                        className={chosen === action ? 'chosen' : ''}
                        aria-label={actions[action]}
                        disabled={
                          locked ||
                          swapping ||
                          (order === 'player' && !live.lineup.includes(p.selected))
                        }
                        key={action}
                        onClick={() => pickAction(action)}
                      >
                        <span>
                          {
                            {
                              DEF_REBOUND: 'Rebote DEF',
                              OFF_REBOUND: 'Rebote OF',
                              ASSIST: 'Asistencia',
                              STEAL: 'Recuperación',
                              TURNOVER: 'Pérdida',
                              FOUL_COMMITTED: 'Falta',
                            }[action as 'ASSIST']
                          }
                        </span>
                      </button>
                    ))}
                  </div>
                  <details className="more-actions">
                    <summary>
                      Más acciones <ChevronDown size={15} />
                    </summary>
                    <div>
                      {(['BLOCK_FOR', 'BLOCK_AGAINST', 'FOUL_DRAWN'] as Action[]).map((action) => (
                        <button
                          disabled={
                            locked ||
                            swapping ||
                            (order === 'player' && !live.lineup.includes(p.selected))
                          }
                          key={action}
                          onClick={() => pickAction(action)}
                        >
                          {actions[action]}
                        </button>
                      ))}
                    </div>
                  </details>
                </section>
              </div>
            </>
          )}
          <LiveMatchStats
            key={game.id}
            game={optimistic!}
            players={p.players}
            clock={p.clock}
            pending={p.pending.length > 0}
          />
          <div className="live-secondary-tools">
            <button disabled={p.running || p.busy} onClick={() => setShowClock(!showClock)}>
              <Clock3 size={17} />
              Ajustar reloj
            </button>
            <button onClick={() => setTimeline(!timeline)}>
              <ChevronDown size={17} />
              {timeline ? 'Ocultar historial' : 'Ver historial'}
            </button>
            {p.canManage && (
              <button
                disabled={p.busy || p.running}
                onClick={() => p.onReview(game.status === 'FINAL' ? 'reopen' : 'finalize')}
              >
                {game.status === 'FINAL' ? 'Reabrir acta' : 'Finalizar partido'}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
          {showClock && (
            <form
              className="live-clock-form"
              onSubmit={async (e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const [m, s] = String(f.get('time')).split(':').map(Number);
                await p.onAdjust(m * 60 + s);
                setShowClock(false);
              }}
            >
              <label>
                Tiempo oficial (mm:ss)
                <input
                  required
                  name="time"
                  pattern="[0-9]{1,2}:[0-5][0-9]"
                  defaultValue={clockText(p.clock)}
                  disabled={p.running}
                />
              </label>
              <button className="primary" disabled={p.running || p.busy}>
                Guardar reloj
              </button>
            </form>
          )}
          {timeline && (
            <section className="live-history">
              <h2>Historial de acciones</h2>
              <div>
                {[...game.events]
                  .reverse()
                  .slice(0, 60)
                  .map((e) => (
                    <article key={e.id} className={e.voided ? 'voided' : ''}>
                      <time>
                        C{e.period} · {clockText(e.remaining)}
                      </time>
                      <strong>{names[e.type] || e.type}</strong>
                      <span>{p.players.find((x) => x.id === e.playerId)?.name}</span>
                      {e.voided ? (
                        <small>Anulado</small>
                      ) : (
                        p.canScore &&
                        active && (
                          <button
                            disabled={p.busy || p.running}
                            aria-label={`Anular evento ${e.sequence}`}
                            onClick={() => {
                              if (
                                confirm(
                                  '¿Anular esta acción? El marcador se recalculará y se conservará el registro.',
                                )
                              )
                                void p.send(
                                  'undo',
                                  {
                                    eventId: e.id,
                                    reason: 'Corrección desde el historial del anotador',
                                  },
                                  game.id,
                                );
                            }}
                          >
                            <Undo2 size={15} />
                          </button>
                        )
                      )}
                    </article>
                  ))}
              </div>
            </section>
          )}
          <details className="live-keyboard-help">
            <summary>
              <Keyboard size={15} />
              Atajos de teclado
            </summary>
            <p>
              1–5: jugador · Q/W: tiro de 2 · E/R: triple · T/Y: libre · A: asistencia · D/O: rebote
              · P: pérdida · F: falta · Espacio: reloj · Z: deshacer.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={16} />;
}
