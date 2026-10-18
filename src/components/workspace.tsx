'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  BarChart3,
  Radio,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Download,
  Search,
  ChevronRight,
  Settings2,
  GitCompareArrows,
  Check,
  X,
  Play,
  Pause,
  Undo2,
  RefreshCw,
  ShieldCheck,
  CircleHelp,
  Activity,
  Trophy,
  Target,
  TrendingUp,
  ArrowLeftRight,
  MapPin,
  LogIn,
  LogOut,
  Shield,
  ShieldAlert,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  loginWithGoogle,
  logoutUser,
  onAuthChange,
  resolveUserRole,
  fetchCatalog,
  createCatalogItem,
  setTeamTrash,
  loadState,
  subscribeToSeason,
  executeAndPersistCommand,
  seedFromMongoDumpIfEmpty,
  type AppUser,
} from '@/lib/firestore-service';
import { processPlayerPhoto } from '@/lib/image-upload';
import { LOGO_PATH } from '@/lib/asset';
import UserManagement from './user-management';
import {
  type AppState,
  type Game,
  type Player,
  type Stats,
  type Action,
  type Role,
  columns,
  actions,
  venueNames,
  SHOWCASE_COMPETITION,
} from '@/domain/basketball/types';
import { aggregate, formatStat, reduceGameEvents, teamStats } from '@/domain/basketball/stats';
import { canWrite } from '@/lib/permissions';
import LiveScorer from './live/live-scorer';
import AnalyticsCharts from './analytics-charts';
import LiveMatchSelection from './live/live-match-selection';
import TeamSelection from './team-selection';
import { useCommandQueue } from './live/use-command-queue';
import type { CatalogEntry } from '@/server/catalog';
type View = 'overview' | 'players' | 'games' | 'live' | 'stats' | 'compare' | 'settings' | 'users';
type Identity = { role: Role; actor: string; demo: boolean; email?: string };
const navigation = [
  { id: 'overview', label: 'Vista general', icon: LayoutDashboard },
  { id: 'players', label: 'Plantilla', icon: Users },
  { id: 'games', label: 'Partidos', icon: CalendarDays },
  { id: 'live', label: 'Anotador en directo', icon: Radio },
  { id: 'stats', label: 'Estadísticas', icon: BarChart3 },
  { id: 'compare', label: 'Comparador', icon: GitCompareArrows },
] as const;
const title: Record<View, string> = {
  overview: 'El equipo, en perspectiva.',
  players: 'Talento que suma.',
  games: 'Cada partido cuenta.',
  live: 'El partido, en tus manos.',
  stats: 'Los datos hablan.',
  compare: 'Distintos perfiles. Un equipo.',
  settings: 'El control del equipo.',
  users: 'Usuarios y control de accesos.',
};
type Modal =
  | { type: 'player'; player?: Player }
  | { type: 'game'; game?: Game }
  | { type: 'roster'; game: Game }
  | { type: 'lineup'; game: Game }
  | { type: 'undo'; game: Game; eventId?: string }
  | { type: 'finalize'; game: Game }
  | { type: 'reopen'; game: Game }
  | { type: 'profile'; player: Player }
  | { type: 'help' }
  | { type: 'catalog'; kind: 'team' | 'season' | 'club' }
  | null;
const toDatetimeLocal = (iso?: string) => {
  if (!iso) return undefined;
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const date = (value: string) =>
  new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Madrid',
  }).format(new Date(value));
const time = (value: number) =>
  `${Math.floor(value / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(value % 60)
    .toString()
    .padStart(2, '0')}`;
function Avatar({ player, large = false }: { player: Player; large?: boolean }) {
  return (
    <span className={`avatar ${large ? 'large' : ''}`}>
      {player.photo ? (
        <img src={player.photo} alt={player.name} />
      ) : (
        <span>
          {player.name
            .split(' ')
            .map((n) => n[0])
            .slice(0, 2)
            .join('')}
        </span>
      )}
    </span>
  );
}
function Court() {
  return (
    <svg viewBox="0 0 360 280" fill="none" aria-hidden="true">
      <path d="M22 10H338V270H22Z M22 210H338 M115 10V110H245V10 M140 10V60H220V10" />
      <circle cx="180" cy="110" r="38" />
      <path d="M22 36C22 230 338 230 338 36 M149 210A31 31 0 0 0 211 210" />
      <path d="M165 30H195 M180 30V40" />
      <circle cx="180" cy="47" r="7" />
    </svg>
  );
}
function MiniLine({ values, color = 'var(--turquoise)' }: { values: number[]; color?: string }) {
  const min = Math.min(...values);
  const range = Math.max(...values) - min;
  return (
    <svg className="sparkline" viewBox="0 0 120 40" aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinejoin="round"
        points={values
          .map(
            (v, i) =>
              `${(i * 120) / Math.max(values.length - 1, 1)},${range ? 34 - ((v - min) / range) * 28 : 20}`,
          )
          .join(' ')}
      />
    </svg>
  );
}
function Panel({
  title,
  sub,
  action,
  children,
  className = '',
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function StatTable({
  players,
  games,
  mean = false,
  total = false,
}: {
  players: Player[];
  games: Game[];
  mean?: boolean;
  total?: boolean;
}) {
  const [group, setGroup] = useState('Todas');
  const groups: Record<string, (keyof Stats)[]> = {
    Todas: columns,
    Tiro: ['Pts', 'T2A', 'T2I', 'T2%', 'T3A', 'T3I', 'T3%', 'T1A', 'T1I', 'T1%'],
    Rebotes: ['Min', 'DReb', 'OReb', 'TReb'],
    Juego: ['Min', 'Asis', 'Rec', 'Per'],
    Disciplina: ['TapF', 'TapC', 'Falt', 'FaltR'],
    Impacto: ['Min', 'Pts', 'Val', 'Partidos', '+/-'],
  };
  const cell = (c: keyof Stats, s: Stats) =>
    formatStat(
      c,
      mean && c !== 'Partidos' && !c.includes('%') && s[c] !== null
        ? (s[c] as number) / Math.max(1, s.Partidos)
        : s[c],
    );
  const team = teamStats(games);
  return (
    <>
      <div className="column-groups">
        {Object.keys(groups).map((g) => (
          <button key={g} onClick={() => setGroup(g)} className={group === g ? 'active' : ''}>
            {g}
          </button>
        ))}
      </div>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">
            Estadísticas completas. Minutos en mm:ss; porcentajes ponderados por intentos.
          </caption>
          <thead>
            <tr>
              <th>Jugador</th>
              {groups[group].map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const s = aggregate(games, p.id);
              return (
                <tr key={p.id}>
                  <th scope="row">
                    <span className="jersey">{String(p.number).padStart(2, '0')}</span>
                    {p.name}
                  </th>
                  {groups[group].map((c) => (
                    <td key={c} className={c === 'Pts' || c === 'Val' ? 'strong' : ''}>
                      {cell(c, s)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {total && (
            <tfoot>
              <tr>
                <th scope="row">Total de equipo</th>
                {groups[group].map((c) => (
                  <td key={c}>{cell(c, team)}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!players.length && <p className="empty">No hay jugadores en esta selección.</p>}
    </>
  );
}
export default function Workspace() {
  const [state, setState] = useState<AppState | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [view, setView] = useState<View>('overview');
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [manualBusy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [venue, setVenue] = useState('ALL');
  const [gameId, setGameId] = useState('');
  const [matchOpen, setMatchOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [running, setRunning] = useState(false);
  const [clock, setClock] = useState(600);
  const [compare, setCompare] = useState<string[]>([]);
  const [mean, setMean] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [opponent, setOpponent] = useState('');
  const clockRef = useRef(600);
  const lastTick = useRef(0);
  const expiredClock = useRef('');
  const modalRef = useRef<HTMLDialogElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const unsubSeasonRef = useRef<(() => void) | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [teamChosen, setTeamChosen] = useState(false);

  const commands = useCommandQueue(
    state,
    setState,
    setError,
    (action, updated) => {
      if (action === 'showcase') {
        setView('overview');
        setMatchOpen(false);
        setNotice('Demo de presentación preparada');
      }
      if (action === 'practice') {
        const practice =
          updated.games.find(
            (game) => game.isPractice && !state?.games.some((previous) => previous.id === game.id),
          ) ||
          [...updated.games]
            .filter((game) => game.isPractice && game.status === 'LIVE')
            .sort((a, b) => b.date.localeCompare(a.date))[0];
        if (!practice) return;
        setGameId(practice.id);
        setSelected(practice.roster[0] || '');
        setView('live');
        setMatchOpen(true);
        setClock(practice.remaining);
        clockRef.current = practice.remaining;
        setRunning(false);
      }
      if (!['event', 'clock', 'undo', 'lineup', 'practice'].includes(action)) {
        setNotice('Cambios guardados');
        setTimeout(() => setNotice(''), 2500);
      }
    },
    async (currentState, cmd) => {
      if (!identity) throw new Error('Usuario no autenticado');
      return executeAndPersistCommand(
        currentState,
        cmd as any,
        identity.actor,
        identity.role,
        firebaseUser?.uid || identity.actor
      );
    }
  );
  const busy = manualBusy || commands.pending.length > 0;
  const load = async (target?: string) => {
    try {
      const parts = target?.split(':');
      const teamId = parts?.[0] || state?.teamId;
      const seasonId = parts?.[1] || state?.seasonId;
      if (!seasonId) return false;

      const nextState = await loadState(teamId || '', seasonId);
      commands.acceptState(nextState);
      setError('');

      if (unsubSeasonRef.current) unsubSeasonRef.current();
      unsubSeasonRef.current = subscribeToSeason(seasonId, (updated) => {
        if (!running && commands.pending.length === 0) {
          commands.acceptState(updated);
        }
      });

      const entries = await fetchCatalog();
      setCatalog(entries);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  const chooseTeam = async (target: string) => {
    if (running || busy) return;
    setBusy(true);
    try {
      if (await load(target)) {
        setGameId('');
        setSelected('');
        setCompare([]);
        setQuery('');
        setVenue('ALL');
        setDateFrom('');
        setDateTo('');
        setOpponent('');
        setShowArchived(false);
        setMean(false);
        setNotice('');
        setModal(null);
        setView('overview');
        setTeamChosen(true);
      }
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const unsub = onAuthChange(async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setAuthLoading(false);
        setIsAuthorized(null);
        setIdentity(null);
        setState(null);
        return;
      }

      setAuthLoading(true);
      try {
        const authResult = await resolveUserRole(user);
        setIsAuthorized(authResult.isAuthorized);

        if (authResult.isAuthorized) {
          setIdentity({
            role: authResult.role,
            actor: user.displayName || user.email?.split('@')[0] || 'Usuario',
            demo: false,
            email: user.email || '',
          });

          if (authResult.role === 'ADMIN') {
            await seedFromMongoDumpIfEmpty();
          }

          const entries = await fetchCatalog();
          setCatalog(entries);

          if (entries.length > 0) {
            const active = entries.find((e) => !e.deletedAt) || entries[0];
            await chooseTeam(`${active.teamId}:${active.seasonId}`);
          }
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setAuthLoading(false);
      }
    });

    return () => {
      unsub();
      if (unsubSeasonRef.current) unsubSeasonRef.current();
    };
  }, []);
  useEffect(() => {
    if (modal) {
      modalRef.current?.showModal();
    } else modalRef.current?.close();
  }, [modal]);
  const game =
    state?.games.find((g) => g.id === gameId) ??
    state?.games.find((g) => g.status === 'LIVE') ??
    state?.games.find((g) => g.status === 'SCHEDULED') ??
    state?.games.at(-1);
  useEffect(() => {
    if (game) {
      setClock(game.remaining);
      clockRef.current = game.remaining;
    }
    setRunning(false);
  }, [game?.id]);
  useEffect(() => {
    if (!running) return;
    lastTick.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const delta = Math.floor((now - lastTick.current) / 1000);
      if (delta < 1) return;
      lastTick.current += delta * 1000;
      clockRef.current = Math.max(0, clockRef.current - delta);
      setClock(clockRef.current);
      if (clockRef.current === 0) {
        expiredClock.current = `${game?.id}:${game?.period}`;
        setRunning(false);
      }
    }, 200);
    return () => clearInterval(id);
  }, [running, game?.id, game?.period]);
  const send = async (
    action: string,
    payload: Record<string, unknown>,
    target = game?.id,
    mutationId = crypto.randomUUID(),
  ) => {
    if (!state) return false;
    if (!commands.syncError) setError('');
    return commands.enqueue(
      action,
      payload,
      target,
      '',
      mutationId,
    );
  };
  const navigate = (next: View) => {
    if (running || busy) return;
    setView(next);
    if (next === 'live') setMatchOpen(false);
    setQuery('');
    setError('');
    mainRef.current?.focus();
  };
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (running || commands.pending.length) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [running, commands.pending.length]);
  const autoSaved = useRef('');
  useEffect(() => {
    if (
      !running &&
      clock === 0 &&
      game?.status === 'LIVE' &&
      game.remaining > 0 &&
      !busy &&
      expiredClock.current === `${game.id}:${game.period}`
    ) {
      const key = `${game.id}:${game.period}`;
      if (autoSaved.current !== key) {
        autoSaved.current = key;
        void send('clock', { remaining: 0 });
      }
    }
  }, [running, clock, game?.id, game?.period, game?.remaining, busy]);
  useEffect(() => {
    if (game && !running) {
      setClock(game.remaining);
      clockRef.current = game.remaining;
    }
  }, [game?.remaining]);
  const exportCsv = () => {
    if (!state) return;
    const escape = (v: string) => {
      const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
      return '"' + safe.replaceAll('"', '""') + '"';
    };
    const lines = [
      [
        'CDIR Basket Analytics',
        state.team,
        state.season,
        venue === 'ALL' ? 'Todas las sedes' : venueNames[venue as keyof typeof venueNames],
        new Date().toISOString(),
        'Europe/Madrid',
      ],
      ['Jugador', 'Dorsal', ...columns],
      ...state.players.map((p) => {
        const s = aggregate(filteredGames, p.id);
        return [p.name, p.number, ...columns.map((c) => formatStat(c, s[c]))];
      }),
      [
        'Leyenda',
        'Min=mm:ss; Pts=puntos; A=anotados; I=intentados; T1=libres; DReb=rebotes defensivos; OReb=ofensivos; TReb=totales; Asis=asistencias; Rec=recuperaciones; Per=pérdidas; TapF=tapones a favor; TapC=recibidos; Falt=cometidas; FaltR=recibidas; Val=valoración provisional; Partidos=participaciones; +/-=diferencial en pista',
      ],
      ['Filtros', dateFrom, dateTo, opponent],
      [
        'Porcentajes',
        'Suma de anotados / suma de intentados. — significa no disponible o sin intentos.',
      ],
    ];
    const blob = new Blob(
      ['\uFEFF' + lines.map((row) => row.map((v) => escape(String(v))).join(';')).join('\r\n')],
      { type: 'text/csv;charset=utf-8' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cdir-estadisticas.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  if (!firebaseUser)
    return (
      <main className="access">
        <img src={LOGO_PATH} alt="CDI Rozasbasket" />
        <p className="eyebrow">CDIR · BASKET ANALYTICS</p>
        <h1>
          El siguiente nivel
          <br />
          de tu equipo.
        </h1>
        <p>{authLoading ? 'Verificando sesión…' : 'Acceso seguro con cuenta de Google autorizada.'}</p>
        {!authLoading && (
          <button
            className="primary"
            onClick={() => loginWithGoogle().catch((e) => setError(e.message))}
          >
            <LogIn size={18} /> Iniciar sesión con Google
          </button>
        )}
        {error && <p className="message error">{error}</p>}
      </main>
    );

  if (isAuthorized === false)
    return (
      <main className="access">
        <img src={LOGO_PATH} alt="CDI Rozasbasket" />
        <p className="eyebrow">ACCESO RESTRINGIDO</p>
        <h1>Cuenta no autorizada</h1>
        <p>
          La cuenta <strong>{firebaseUser.email}</strong> no tiene permisos de acceso a Basket Analytics.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Solicita a un administrador que dé de alta tu Gmail en la aplicación.
        </p>
        <button className="secondary" onClick={() => logoutUser()}>
          <LogOut size={16} /> Cerrar sesión y probar otra cuenta
        </button>
      </main>
    );

  if (!state || !identity)
    return (
      <main className="access">
        <img src={LOGO_PATH} alt="CDI Rozasbasket" />
        <p className="eyebrow">CDIR · BASKET ANALYTICS</p>
        <h1>Cargando equipo…</h1>
        <p>{error || 'Conectando con Firestore…'}</p>
        {error && (
          <button className="secondary" onClick={() => load()}>
            Reintentar
          </button>
        )}
      </main>
    );

  if (!teamChosen)
    return (
      <TeamSelection
        entries={catalog}
        canCreate={identity.role === 'ADMIN'}
        demo={false}
        busy={busy}
        error={error}
        onSelect={chooseTeam}
        onDelete={async (team) => {
          setBusy(true);
          setError('');
          try {
            await setTeamTrash(team.teamId, true);
            const refreshed = await fetchCatalog();
            setCatalog(refreshed);
            return true;
          } catch (err) {
            setError((err as Error).message);
            return false;
          } finally {
            setBusy(false);
          }
        }}
        onRestore={async (team) => {
          setBusy(true);
          setError('');
          try {
            await setTeamTrash(team.teamId, false);
            const refreshed = await fetchCatalog();
            setCatalog(refreshed);
            return true;
          } catch (err) {
            setError((err as Error).message);
            return false;
          } finally {
            setBusy(false);
          }
        }}
        onCreate={async (data) => {
          setBusy(true);
          setError('');
          try {
            const entry = await createCatalogItem(data as any, state?.seasonId);
            const refreshed = await fetchCatalog();
            setCatalog(refreshed);
            await chooseTeam(`${entry.teamId}:${entry.seasonId}`);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  const writable = canWrite(identity.role, 'player');
  const scorer = canWrite(identity.role, 'event');
  const matchesAnalyticsFilters = (g: Game) =>
    (venue === 'ALL' || g.venue === venue) &&
    (!dateFrom || g.date.slice(0, 10) >= dateFrom) &&
    (!dateTo || g.date.slice(0, 10) <= dateTo) &&
    (!opponent || g.opponent === opponent);
  const filteredGames = state.games.filter(
    (g) => (!g.isPractice || state.isSandbox) && matchesAnalyticsFilters(g),
  );
  const analyticsGames = state.games.filter(matchesAnalyticsFilters);
  const completed = filteredGames.filter((g) => g.status === 'FINAL');
  const results = completed.map((g) => ({ ...reduceGameEvents(g), game: g }));
  const wins = results.filter((r) => r.ours > r.opponent).length;
  const scored = results.reduce((n, r) => n + r.ours, 0);
  const chartMax =
    Math.ceil(Math.max(100, ...results.flatMap((r) => [r.ours, r.opponent])) / 25) * 25;
  const conceded = results.reduce((n, r) => n + r.opponent, 0);
  const playerStats = state.players.map((p) => ({
    player: p,
    stats: aggregate(filteredGames, p.id),
  }));
  const leaders = [...playerStats].sort((a, b) => b.stats.Pts - a.stats.Pts).slice(0, 4);
  const visiblePlayers = state.players.filter(
    (p) => (showArchived || p.active) && p.name.toLowerCase().includes(query.toLowerCase()),
  );
  const upcoming = state.games
    .filter(
      (g) =>
        (!g.isPractice || state.isSandbox) &&
        (g.status === 'SCHEDULED' || (!state.isSandbox && g.status === 'LIVE')),
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const live = game ? reduceGameEvents(game) : null;
  const field = (
    label: string,
    name: string,
    defaultValue?: string | number,
    type = 'text',
    required = true,
  ) => (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        maxLength={type === 'text' ? 100 : undefined}
      />
    </label>
  );
  const submitModal = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let ok = false;
    if (modal?.type === 'catalog') {
      setBusy(true);
      try {
        const entry = await createCatalogItem(
          {
            type: modal.kind,
            name: String(f.get('name') || ''),
            category: String(f.get('category') || ''),
            season: String(f.get('season') || ''),
            startsAt: String(f.get('startsAt') || ''),
            endsAt: String(f.get('endsAt') || ''),
            clubName: f.get('clubName') ? String(f.get('clubName')) : undefined,
            carryRoster: f.get('carryRoster') === 'on',
          },
          state.seasonId
        );
        const entries = await fetchCatalog();
        setCatalog(entries);
        await load(`${entry.teamId}:${entry.seasonId}`);
        setGameId('');
        setSelected('');
        setCompare([]);
        setView('overview');
        ok = true;
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    }
    if (modal?.type === 'player') {
      let photo = modal.player?.photo;
      const file = f.get('photo') as File;
      if (file?.size) {
        setBusy(true);
        try {
          photo = await processPlayerPhoto(file);
        } catch (err) {
          setError((err as Error).message);
          return;
        } finally {
          setBusy(false);
        }
      }
      ok = await send('player', {
        ...(modal.player ? { id: modal.player.id } : {}),
        name: f.get('name'),
        number: Number(f.get('number')),
        position: f.get('position'),
        active: modal.player?.active ?? true,
        photo,
      });
    }
    if (modal?.type === 'game') {
      ok = await send('game', {
        ...(modal.game ? { id: modal.game.id } : {}),
        opponent: f.get('opponent'),
        date: new Date(String(f.get('date'))).toISOString(),
        timezone: 'Europe/Madrid',
        venue: f.get('venue'),
        competition: f.get('competition'),
        rules: {
          periods: Number(f.get('periods')),
          periodSeconds: Number(f.get('minutes')) * 60,
          overtimeSeconds: Number(f.get('overtime')) * 60,
        },
      });
    }
    if (modal?.type === 'roster')
      ok = await send('roster', { roster: f.getAll('roster') }, modal.game.id);
    if (modal?.type === 'lineup')
      ok = await send('lineup', { lineup: f.getAll('lineup') }, modal.game.id);
    if (modal?.type === 'undo')
      ok = await send('undo', { reason: f.get('reason'), eventId: modal.eventId }, modal.game.id);
    if (modal?.type === 'finalize')
      ok = await send(
        'finalize',
        { ours: Number(f.get('ours')), opponent: Number(f.get('opponent')) },
        modal.game.id,
      );
    if (modal?.type === 'reopen')
      ok = await send('reopen', { reason: f.get('reason') }, modal.game.id);
    if (ok) setModal(null);
  };
  return (
    <div className={`app-shell ${view === 'live' && matchOpen ? 'live-mode' : ''}`}>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="CDIR Basket Analytics">
          <img src={LOGO_PATH} alt="" />
          <span>
            CDIR<span className="brand-caption">BASKET ANALYTICS</span>
          </span>
        </a>
        <div className="workspace-label">ESPACIO DEL CLUB</div>
        <div className="team-card">
          <span className="team-monogram">
            {state.team
              .split(' ')
              .slice(0, 2)
              .map((n) => n[0])
              .join('')}
          </span>
          <div>
            <strong>{state.team}</strong>
            <small>{state.category.split(' · ')[0]}</small>
          </div>
          <ShieldCheck size={15} />
        </div>
        <button
          className="switch-team-button"
          disabled={running || busy}
          onClick={() => {
            setError('');
            setTeamChosen(false);
          }}
        >
          <Users size={16} />
          <span>Cambiar equipo</span>
        </button>
        <div className="workspace-label">TU EQUIPO</div>
        <nav aria-label="Principal">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              aria-label={label}
              disabled={running}
              key={id}
              onClick={() => navigate(id)}
              className={view === id ? 'selected' : ''}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === 'live' && <span className="live-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="club-note">
            <Court />
            <strong>
              UN EQUIPO.
              <br />
              MIL FORMAS DE SUMAR.
            </strong>
            <small>
              Distintas capacidades.
              <br />
              Una misma pasión.
            </small>
          </div>
          {identity.role === 'ADMIN' && (
            <button
              className={view === 'users' ? 'selected' : ''}
              onClick={() => navigate('users')}
              disabled={running}
            >
              <Shield size={18} />
              Usuarios y Roles
            </button>
          )}
          <button
            className={view === 'settings' ? 'selected' : ''}
            onClick={() => navigate('settings')}
            disabled={running}
          >
            <Settings2 size={18} />
            Configuración
          </button>
          <button onClick={() => setModal({ type: 'help' })}>
            <CircleHelp size={18} />
            Ayuda y métricas
          </button>
          <div className="user">
            <span className="user-avatar">{identity.actor.slice(0, 2).toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {identity.actor}
              </strong>
              <small>{identity.role === 'ADMIN' ? 'Administrador' : 'Normal'}</small>
            </div>
            <button
              onClick={() => logoutUser()}
              className="icon-button"
              title="Cerrar sesión"
              style={{ background: 'transparent', padding: '4px' }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            {state.club} <ChevronRight size={13} /> <strong>{state.team}</strong>
          </div>
          <div className="topbar-right">
            <button
              className="icon-button"
              aria-label="Elegir otro equipo"
              disabled={running || busy}
              onClick={() => {
                setError('');
                setTeamChosen(false);
              }}
            >
              <Users size={18} />
            </button>
            <span className="season">
              <CalendarDays size={15} /> {state.season}
            </span>
            <button
              className="icon-button"
              aria-label="Configuración del equipo"
              disabled={running}
              onClick={() => navigate('settings')}
            >
              <Settings2 size={17} />
            </button>
            <span className="saved">
              <span /> {busy ? 'Guardando…' : identity.demo ? 'Demo local' : 'Conectado'}
            </span>
            <button
              className="icon-button"
              aria-label="Actualizar datos"
              onClick={() => load()}
              disabled={running || busy}
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </header>
        <main id="contenido" tabIndex={-1} ref={mainRef}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {state.team.toUpperCase()} <span>/</span>{' '}
                {navigation.find((n) => n.id === view)?.label.toUpperCase() || 'CONFIGURACIÓN'}
              </p>
              <h1>{view === 'live' && !matchOpen ? 'Elige el partido.' : title[view]}</h1>
              <p className="subtitle">
                {view === 'overview'
                  ? 'Toda la temporada. Cada detalle. Una visión para seguir creciendo.'
                  : view === 'live'
                    ? 'Abre un encuentro para ver su marcador, quinteto y estadísticas.'
                    : 'Información conectada para tomar mejores decisiones.'}
              </p>
            </div>
            <div className="heading-actions">
              {view !== 'live' && (
                <button className="secondary" onClick={exportCsv}>
                  <Download size={16} /> Exportar CSV
                </button>
              )}
              {writable && view !== 'live' && (
                <button
                  className="primary"
                  onClick={() => setModal({ type: view === 'players' ? 'player' : 'game' })}
                >
                  <Plus size={17} />
                  {view === 'players' ? 'Añadir jugador' : 'Nuevo partido'}
                </button>
              )}
            </div>
          </div>
          {(identity.demo || state.isSandbox) && (
            <div className="demo-banner">
              <span className="demo-tag">{state.isSandbox ? 'ATLAS · PRUEBAS' : 'DEMO'}</span>{' '}
              {state.isSandbox
                ? 'Equipo de pruebas: las estadísticas incluyen simulaciones para la presentación. No afectan a otros equipos.'
                : 'Datos ficticios para explorar la aplicación. Los cambios se guardan en este servidor local.'}
              {state.isSandbox && identity.role === 'ADMIN' && (
                <button
                  className="showcase-button"
                  disabled={
                    busy ||
                    running ||
                    state.games.some((game) => game.competition === SHOWCASE_COMPETITION)
                  }
                  onClick={() => {
                    void send('showcase', {});
                  }}
                >
                  {state.games.some((game) => game.competition === SHOWCASE_COMPETITION)
                    ? 'Demo de presentación lista'
                    : 'Preparar demo de presentación'}
                </button>
              )}
              <span className="desktop-only">Entorno de demostración</span>
            </div>
          )}
          {catalog.length > 1 && (
            <label className="workspace-switch">
              Equipo y temporada
              <select
                aria-label="Equipo y temporada"
                disabled={running || busy}
                value={`${state.teamId}:${state.seasonId || '40000000-0000-4000-8000-000000000001'}`}
                onChange={(e) => {
                  void chooseTeam(e.target.value);
                }}
              >
                {catalog
                  .filter((c) => !c.deletedAt)
                  .map((c) => (
                    <option key={`${c.teamId}:${c.seasonId}`} value={`${c.teamId}:${c.seasonId}`}>
                      {c.club} · {c.team} · {c.season}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {error && (
            <div className="message error" role="alert">
              {error}
              <button aria-label="Cerrar aviso" onClick={() => setError('')}>
                <X size={17} />
              </button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <Check size={16} />
              {notice}
            </div>
          )}
          {['overview', 'stats', 'compare', 'games'].includes(view) && (
            <div className="filterbar">
              <div className="segmented" aria-label="Filtrar por sede">
                {[
                  ['ALL', 'Todos'],
                  ['HOME', 'En casa'],
                  ['AWAY', 'Fuera'],
                  ['NEUTRAL', 'Neutral'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={venue === id}
                    className={venue === id ? 'active' : ''}
                    onClick={() => setVenue(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="filter-summary">
                <span />
                {completed.length} partidos finalizados <span className="dot-divider">·</span>{' '}
                {state.season}
              </span>
            </div>
          )}
          {view === 'overview' && (
            <>
              <div className="overview-top">
                <section className="season-hero">
                  <div>
                    <p className="eyebrow">EL TRABAJO SE CONVIERTE EN JUEGO</p>
                    <h2>
                      JUNTOS,
                      <br />
                      MÁS LEJOS<span>.</span>
                    </h2>
                    <p>
                      Una temporada para aprender,
                      <br />
                      competir y seguir sumando.
                    </p>
                    <button onClick={() => navigate('stats')}>
                      Explorar estadísticas <ArrowUpRight size={20} />
                    </button>
                  </div>
                  <div className="hero-court">
                    <Court />
                    <span className="court-point p1" />
                    <span className="court-point p2" />
                    <span className="court-point p3" />
                  </div>
                  <span className="hero-season">CDIR / {state.season.replaceAll(' ', '')}</span>
                </section>
                <section className="next-game">
                  <div className="section-kicker">
                    <span className="live-dot" /> PRÓXIMO ENCUENTRO <ArrowUpRight size={18} />
                  </div>
                  {upcoming ? (
                    <>
                      <div className="next-game-date">
                        <CalendarDays size={14} />
                        {date(upcoming.date)} <span>·</span>
                        {new Intl.DateTimeFormat('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Europe/Madrid',
                        }).format(new Date(upcoming.date))}
                      </div>
                      <div className="match-teams">
                        <div>
                          <img src={LOGO_PATH} alt="" />
                          <strong>CDIR</strong>
                        </div>
                        <span>VS</span>
                        <div>
                          <span className="opponent-badge">
                            {upcoming.opponent
                              .split(' ')
                              .map((w) => w[0])
                              .join('')
                              .slice(0, 3)}
                          </span>
                          <strong>{upcoming.opponent}</strong>
                        </div>
                      </div>
                      <p className="game-location">
                        <MapPin size={13} />
                        {venueNames[upcoming.venue]} <span>·</span>
                        {upcoming.competition}
                      </p>
                      <button
                        className="secondary full"
                        onClick={() => {
                          setGameId(upcoming.id);
                          navigate('live');
                          setMatchOpen(true);
                        }}
                      >
                        Preparar partido <ArrowRight size={16} />
                      </button>
                    </>
                  ) : (
                    <div className="empty">Añade el próximo encuentro al calendario.</div>
                  )}
                </section>
              </div>
              <div className="kpi-grid">
                {[
                  {
                    label: 'PARTIDOS JUGADOS',
                    value: String(completed.length).padStart(2, '0'),
                    note: `${wins} victorias · ${completed.length - wins} derrotas`,
                    icon: Trophy,
                    values: results.map((_, i) => i + 1),
                  },
                  {
                    label: 'PUNTOS A FAVOR',
                    value: completed.length ? (scored / completed.length).toFixed(1) : '—',
                    note: 'Media por partido',
                    icon: Target,
                    values: results.map((r) => r.ours),
                  },
                  {
                    label: 'PUNTOS EN CONTRA',
                    value: completed.length ? (conceded / completed.length).toFixed(1) : '—',
                    note: 'Media por partido',
                    icon: ShieldCheck,
                    values: results.map((r) => r.opponent),
                  },
                  {
                    label: 'BALANCE DEL EQUIPO',
                    value: `${scored - conceded > 0 ? '+' : ''}${scored - conceded}`,
                    note: 'Diferencial acumulado',
                    icon: Activity,
                    values: results.map((r) => r.ours - r.opponent),
                  },
                ].map((k) => (
                  <section className="kpi" key={k.label}>
                    <div className="kpi-label">
                      {k.label}
                      <k.icon size={17} />
                    </div>
                    <div className="kpi-number">
                      {k.value}
                      <MiniLine values={k.values.length ? k.values : [0, 0]} />
                    </div>
                    <p>{k.note}</p>
                  </section>
                ))}
              </div>
              <div className="dashboard-grid">
                <Panel
                  title="El pulso de la temporada"
                  sub="Puntos por partido · resultados finalizados"
                  action={
                    <span className="chart-legend">
                      <i />
                      CDIR <i />
                      Rival
                    </span>
                  }
                >
                  <div className="chart">
                    <div className="chart-grid">
                      {[1, 0.75, 0.5, 0.25, 0].map((factor) => (
                        <span key={factor}>{chartMax * factor}</span>
                      ))}
                    </div>
                    <div className="chart-bars">
                      {results.map((r, i) => (
                        <div className="chart-column" key={r.game.id}>
                          <div className="bar-pair">
                            <span
                              title={`${r.game.opponent}: CDIR ${r.ours}`}
                              style={{ height: `${(r.ours / chartMax) * 100}%` }}
                            />
                            <span
                              title={`Rival: ${r.opponent}`}
                              style={{ height: `${(r.opponent / chartMax) * 100}%` }}
                            />
                          </div>
                          <small>J{i + 1}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="chart-footnote">
                    <TrendingUp size={15} /> Cada partido es una oportunidad de crecer.
                    <button onClick={() => navigate('stats')}>
                      Ver detalle <ArrowRight size={14} />
                    </button>
                  </div>
                  <details className="chart-data">
                    <summary>Ver datos de la gráfica</summary>
                    {results.map((r) => (
                      <p key={r.game.id}>
                        {r.game.competition}: CDIR {r.ours} – {r.opponent} {r.game.opponent}
                      </p>
                    ))}
                  </details>
                </Panel>
                <Panel
                  title="Los que marcan el ritmo"
                  sub="Líderes en puntos · temporada"
                  action={
                    <button
                      className="icon-button"
                      aria-label="Ver plantilla"
                      onClick={() => navigate('players')}
                    >
                      <ArrowUpRight size={20} />
                    </button>
                  }
                >
                  {leaders.map((row, i) => (
                    <button
                      className="leader-row"
                      key={row.player.id}
                      onClick={() => setModal({ type: 'profile', player: row.player })}
                    >
                      <span className="rank">0{i + 1}</span>
                      <Avatar player={row.player} />
                      <span className="leader-name">
                        <strong>{row.player.name}</strong>
                        <small>
                          #{row.player.number} · {row.player.position}
                        </small>
                      </span>
                      <span className="leader-stat">
                        {row.stats.Partidos ? (row.stats.Pts / row.stats.Partidos).toFixed(1) : '—'}
                        <small>PTS / PART.</small>
                      </span>
                    </button>
                  ))}
                  <button className="panel-link" onClick={() => navigate('compare')}>
                    Comparar jugadores <GitCompareArrows size={16} />
                  </button>
                </Panel>
              </div>
              <Panel
                title="Últimos resultados"
                sub="El camino que estamos construyendo"
                action={
                  <button className="text-button" onClick={() => navigate('games')}>
                    Todos los partidos <ArrowRight size={15} />
                  </button>
                }
              >
                <div className="results-grid">
                  {results
                    .slice(-3)
                    .reverse()
                    .map((r) => (
                      <button
                        key={r.game.id}
                        className="result-card"
                        onClick={() => {
                          setGameId(r.game.id);
                          navigate('live');
                          setMatchOpen(true);
                        }}
                      >
                        <div>
                          <span className={`result-badge ${r.ours > r.opponent ? 'win' : ''}`}>
                            {r.ours > r.opponent ? 'VICTORIA' : 'DERROTA'}
                          </span>
                          <small>{date(r.game.date)}</small>
                        </div>
                        <p>
                          CDIR{' '}
                          <b>
                            {r.ours} <span>–</span> {r.opponent}
                          </b>
                        </p>
                        <div>
                          <strong>{r.game.opponent}</strong>
                          <span>
                            {venueNames[r.game.venue]} <ArrowUpRight size={14} />
                          </span>
                        </div>
                      </button>
                    ))}
                </div>
                {!results.length && (
                  <p className="empty">
                    Los resultados aparecerán cuando finalices tu primer partido.
                  </p>
                )}
              </Panel>
            </>
          )}
          {view === 'players' && (
            <>
              <div className="content-toolbar">
                <label className="search">
                  <Search size={17} />
                  <input
                    placeholder="Buscar en la plantilla…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                  />
                  Incluir archivados
                </label>
                <span>{visiblePlayers.length} jugadores</span>
              </div>
              <div className="roster-grid">
                {visiblePlayers.map((p) => {
                  const s = aggregate(filteredGames, p.id);
                  return (
                    <article className={`player-card ${!p.active ? 'archived' : ''}`} key={p.id}>
                      <div className="player-card-top">
                        <span className="eyebrow">{p.position}</span>
                        <span className="player-number">{String(p.number).padStart(2, '0')}</span>
                      </div>
                      <div className="player-avatar-wrap">
                        <Avatar player={p} large />
                        <div className="player-court-line" />
                      </div>
                      <h2>{p.name}</h2>
                      <span className="player-status">
                        {p.active ? 'Plantilla activa' : 'Archivado'}
                      </span>
                      <div className="player-kpis">
                        <div>
                          <strong>{s.Partidos ? (s.Pts / s.Partidos).toFixed(1) : '—'}</strong>
                          <small>PTS / PART.</small>
                        </div>
                        <div>
                          <strong>{s.Partidos ? (s.TReb / s.Partidos).toFixed(1) : '—'}</strong>
                          <small>REB / PART.</small>
                        </div>
                        <div>
                          <strong>{s.Partidos ? (s.Val / s.Partidos).toFixed(1) : '—'}</strong>
                          <small>VAL / PART.</small>
                        </div>
                      </div>
                      <div className="player-actions">
                        <button onClick={() => setModal({ type: 'profile', player: p })}>
                          Ver ficha <ArrowUpRight size={16} />
                        </button>
                        {writable && (
                          <button
                            aria-label={`Editar ${p.name}`}
                            onClick={() => setModal({ type: 'player', player: p })}
                          >
                            <Settings2 size={16} />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              {!visiblePlayers.length && (
                <p className="empty">No hay jugadores que coincidan con la búsqueda.</p>
              )}
            </>
          )}
          {view === 'games' && (
            <Panel
              title="Calendario de competición"
              sub="Horarios en Europe/Madrid. La sede corresponde a la perspectiva de CDIR."
            >
              <div className="games-list">
                {[...filteredGames]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((g) => {
                    const r = reduceGameEvents(g);
                    return (
                      <article className="game-list-row" key={g.id}>
                        <div className="date-block">
                          <strong>{new Date(g.date).getUTCDate()}</strong>
                          <small>
                            {new Intl.DateTimeFormat('es-ES', {
                              month: 'short',
                              timeZone: 'Europe/Madrid',
                            }).format(new Date(g.date))}
                          </small>
                        </div>
                        <div className="game-row-copy">
                          <small>
                            {g.competition} <span>· {venueNames[g.venue]}</span>
                          </small>
                          <h3>
                            CDIR <span>vs</span> {g.opponent}
                          </h3>
                          <span>
                            {new Intl.DateTimeFormat('es-ES', {
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Europe/Madrid',
                            }).format(new Date(g.date))}{' '}
                            · Europe/Madrid
                          </span>
                        </div>
                        <span className={`status ${g.status.toLowerCase()}`}>
                          {
                            {
                              FINAL: 'Finalizado',
                              LIVE: 'En directo',
                              SCHEDULED: 'Programado',
                              CANCELLED: 'Cancelado',
                            }[g.status]
                          }
                        </span>
                        <strong className="game-row-score">
                          {g.status === 'SCHEDULED' ? '—' : `${r.ours} – ${r.opponent}`}
                        </strong>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          {writable && g.status === 'SCHEDULED' && new Date(g.date).getTime() > Date.now() && (
                            <button
                              className="secondary"
                              aria-label={`Editar ${g.opponent}`}
                              onClick={() => setModal({ type: 'game', game: g })}
                            >
                              <Settings2 size={15} /> Editar
                            </button>
                          )}
                          <button
                            className="secondary"
                            onClick={() => {
                              setGameId(g.id);
                              navigate('live');
                              setMatchOpen(true);
                            }}
                          >
                            Abrir <ArrowUpRight size={16} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
              </div>
              {!filteredGames.length && (
                <p className="empty">No hay partidos para los filtros seleccionados.</p>
              )}
            </Panel>
          )}
          {view === 'stats' && (
            <>
              <div className="advanced-filters">
                <label>
                  Desde
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </label>
                <label>
                  Hasta
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </label>
                <label>
                  Rival
                  <select value={opponent} onChange={(e) => setOpponent(e.target.value)}>
                    <option value="">Todos los rivales</option>
                    {[...new Set(state.games.map((g) => g.opponent))].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="text-button"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setOpponent('');
                    setVenue('ALL');
                  }}
                >
                  Limpiar filtros
                </button>
              </div>
              <Panel
                title="Estadísticas de la plantilla"
                sub="Las 24 métricas del informe. Porcentajes ponderados por intentos."
                action={
                  <div className="segmented">
                    <button className={!mean ? 'active' : ''} onClick={() => setMean(false)}>
                      Totales
                    </button>
                    <button className={mean ? 'active' : ''} onClick={() => setMean(true)}>
                      Medias
                    </button>
                  </div>
                }
              >
                <StatTable players={state.players} games={filteredGames} mean={mean} total />
                <p className="table-note">
                  — Sin intentos o dato no disponible. Min en mm:ss. Valoración según la fórmula
                  provisional del club. Los partidos cancelados se excluyen.
                </p>
              </Panel>
              <AnalyticsCharts
                players={state.players}
                games={analyticsGames}
                includePracticeByDefault={state.isSandbox}
              />
            </>
          )}
          {view === 'compare' && (
            <>
              <div className="advanced-filters">
                <label>
                  Desde
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </label>
                <label>
                  Hasta
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </label>
                <label>
                  Rival
                  <select value={opponent} onChange={(e) => setOpponent(e.target.value)}>
                    <option value="">Todos los rivales</option>
                    {[...new Set(state.games.map((g) => g.opponent))].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="text-button"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setOpponent('');
                    setVenue('ALL');
                  }}
                >
                  Limpiar filtros
                </button>
              </div>
              <Panel
                title="Selecciona hasta cuatro jugadores"
                sub="La comparación utiliza los mismos partidos y filtros para todos."
              >
                <div className="compare-picker">
                  {state.players
                    .filter((p) => p.active)
                    .map((p) => (
                      <button
                        className={compare.includes(p.id) ? 'active' : ''}
                        key={p.id}
                        aria-pressed={compare.includes(p.id)}
                        disabled={!compare.includes(p.id) && compare.length === 4}
                        onClick={() =>
                          setCompare(
                            compare.includes(p.id)
                              ? compare.filter((id) => id !== p.id)
                              : [...compare, p.id],
                          )
                        }
                      >
                        <span className="jersey">{p.number}</span>
                        {p.name}
                        {compare.includes(p.id) && <Check size={15} />}
                      </button>
                    ))}
                </div>
              </Panel>
              {compare.length ? (
                <Panel title="Perfiles en perspectiva" sub="Totales de temporada · mismas unidades">
                  <StatTable
                    players={state.players.filter((p) => compare.includes(p.id))}
                    games={filteredGames}
                  />
                </Panel>
              ) : (
                <p className="empty">Selecciona jugadores para ver la comparación.</p>
              )}
              {!!compare.length && (
                <AnalyticsCharts
                  comparison
                  includePracticeByDefault={state.isSandbox}
                  players={state.players.filter((player) => compare.includes(player.id))}
                  games={analyticsGames}
                />
              )}
            </>
          )}
          {view === 'live' && !matchOpen && (
            <LiveMatchSelection
              games={state.games}
              sandbox={state.isSandbox}
              team={state.team}
              busy={busy}
              canScore={scorer}
              onOpen={(id) => {
                setGameId(id);
                setSelected('');
                setMatchOpen(true);
              }}
              onPractice={() => {
                void send('practice', {});
              }}
              onEdit={(g) => setModal({ type: 'game', game: g })}
            />
          )}
          {view === 'live' && matchOpen && (
            <LiveScorer
              onBack={() => {
                if (!running && !busy) {
                  setMatchOpen(false);
                  setSelected('');
                  mainRef.current?.focus();
                }
              }}
              teamName={state.team}
              game={game}
              games={state.games}
              players={state.players}
              selected={selected}
              onSelect={setSelected}
              onGame={(id) => {
                setGameId(id);
                setSelected('');
              }}
              clock={clock}
              running={running}
              onClock={(next) => {
                setRunning(next);
                if (!next) void send('clock', { remaining: clockRef.current });
              }}
              onAdjust={async (seconds) => {
                await send('clock', { remaining: seconds });
              }}
              send={send}
              canScore={scorer}
              canManage={writable}
              busy={busy}
              pending={commands.pending}
              syncError={commands.syncError}
              onRetry={() => {
                setError('');
                commands.retry();
              }}
              onReview={(kind) => {
                if (game) setModal({ type: kind, game });
              }}
              demo={identity.demo}
            />
          )}
          {view === 'users' && <UserManagement currentUserEmail={identity.email || ''} />}
          {view === 'settings' && (
            <>
              {identity.role === 'ADMIN' && (
                <div className="scorer-tools">
                  <button
                    className="secondary"
                    onClick={() => setModal({ type: 'catalog', kind: 'club' })}
                  >
                    <Plus size={16} />
                    Nuevo club
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setModal({ type: 'catalog', kind: 'team' })}
                  >
                    <Plus size={16} />
                    Nuevo equipo
                  </button>
                  <button
                    className="primary"
                    onClick={() => setModal({ type: 'catalog', kind: 'season' })}
                  >
                    <Plus size={16} />
                    Nueva temporada
                  </button>
                </div>
              )}
              <div className="settings-grid">
                <Panel
                  title="Identidad del equipo"
                  sub="La misma identidad. Una nueva forma de entender el juego."
                >
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      await send('team', { team: f.get('team'), category: f.get('category') });
                    }}
                  >
                    <div className="settings-brand">
                      <img src={LOGO_PATH} alt="Escudo de CDI Rozasbasket" />
                      <span>
                        CDIR<span>Basket Analytics</span>
                      </span>
                    </div>
                    {field('Nombre del equipo', 'team', state.team)}
                    {field('Categoría', 'category', state.category)}
                    {identity.role === 'ADMIN' && (
                      <button className="primary" disabled={busy}>
                        Guardar equipo
                      </button>
                    )}
                  </form>
                </Panel>
                <Panel title="Acceso y almacenamiento" sub="Estado real de la instalación">
                  <dl className="details-list">
                    <div>
                      <dt>Modo</dt>
                      <dd>{identity.demo ? 'Demostración local' : 'MongoDB'}</dd>
                    </div>
                    <div>
                      <dt>Usuario</dt>
                      <dd>{identity.actor}</dd>
                    </div>
                    <div>
                      <dt>Rol del equipo</dt>
                      <dd>{identity.role}</dd>
                    </div>
                    <div>
                      <dt>Zona horaria</dt>
                      <dd>Europe/Madrid</dd>
                    </div>
                    <div>
                      <dt>Datos</dt>
                      <dd>{identity.demo ? 'Archivo del servidor' : 'MongoDB Atlas'}</dd>
                    </div>
                  </dl>
                  <p className="inline-note">
                    {identity.demo
                      ? 'La demo no es un entorno compartido de producción. Autenticación y permisos reales requieren configurar MongoDB y el proveedor de acceso.'
                      : 'El acceso se comprueba en el servidor para cada operación.'}
                  </p>
                  <div className="account-action">
                    <button
                      className="secondary"
                      onClick={() => logoutUser()}
                    >
                      Cerrar sesión
                    </button>
                  </div>
                </Panel>
              </div>
              <Panel title="Auditoría" sub="Acciones registradas con actor, fecha y motivo">
                <div className="audit-list">
                  {[...state.audit]
                    .reverse()
                    .slice(0, 100)
                    .map((a) => (
                      <div key={a.id}>
                        <span>
                          {new Date(a.at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
                        </span>
                        <strong>{a.actor}</strong>
                        <span>{a.detail}</span>
                      </div>
                    ))}
                </div>
                {!state.audit.length && (
                  <p className="empty">Las acciones que realices quedarán registradas aquí.</p>
                )}
              </Panel>
            </>
          )}
          {view === 'users' && (
            <UserManagement currentUserEmail={firebaseUser?.email || ''} />
          )}
          <footer className="app-footer">
            <span>
              CDIR <b>/</b> BASKET ANALYTICS
            </span>
            <span>El juego se vive. Los datos lo mejoran.</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        {navigation
          .filter((n) => ['overview', 'players', 'games', 'live', 'stats'].includes(n.id))
          .map(({ id, label, icon: Icon }) => (
            <button
              disabled={running}
              key={id}
              onClick={() => navigate(id)}
              className={view === id ? 'active' : ''}
            >
              <Icon size={20} />
              <span>{id === 'overview' ? 'Inicio' : id === 'live' ? 'Directo' : label}</span>
            </button>
          ))}
      </nav>
      <dialog
        ref={modalRef}
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal(null);
        }}
      >
        <div className="modal-heading">
          <p className="eyebrow">CDIR / CENTRO DE EQUIPO</p>
          <button
            className="icon-button"
            aria-label="Cerrar ventana"
            onClick={() => setModal(null)}
          >
            <X size={22} />
          </button>
        </div>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        {modal?.type === 'help' ? (
          <>
            <h2>Entender para mejorar.</h2>
            <p>
              Los puntos, porcentajes y valoración se calculan a partir de los eventos. Sin intentos
              se muestra «—». Los porcentajes de temporada usan la suma de anotados y de intentados.
            </p>
            <p>
              El +/− utiliza el quinteto de cada anotación propia o rival. Los minutos se
              reconstruyen con el tiempo oficial. Deshacer conserva la acción anulada en el
              historial.
            </p>
            <p>
              Para anotar: define el quinteto, inicia el partido, selecciona un jugador y toca una
              acción. Registra también los puntos del rival. Para cerrar: confirma el marcador,
              todos los periodos y los minutos.
            </p>
            <p>
              La demo utiliza datos ficticios. No ofrece funcionamiento sin conexión ni
              sincronización entre dispositivos.
            </p>
          </>
        ) : modal?.type === 'profile' ? (
          <>
            <div className="profile-heading">
              <Avatar player={modal.player} large />
              <div>
                <p>
                  #{modal.player.number} · {modal.player.position}
                </p>
                <h2>{modal.player.name}</h2>
              </div>
            </div>
            <StatTable players={[modal.player]} games={filteredGames} />
            <h3>Partidos de la temporada</h3>
            <div className="profile-games">
              {filteredGames
                .filter(
                  (g) =>
                    g.status !== 'CANCELLED' &&
                    reduceGameEvents(g).stats[modal.player.id]?.Partidos,
                )
                .map((g) => {
                  const s = reduceGameEvents(g).stats[modal.player.id];
                  return (
                    <div key={g.id}>
                      <span>
                        {date(g.date)} · {g.opponent} · {venueNames[g.venue]}
                      </span>
                      <strong>
                        {s.Pts} PTS / {s.Val} VAL / {formatStat('+/-', s['+/-'])}
                      </strong>
                    </div>
                  );
                })}
            </div>
            {writable && (
              <div className="modal-actions">
                <button
                  className="secondary"
                  onClick={() => setModal({ type: 'player', player: modal.player })}
                >
                  Editar jugador
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    if (
                      confirm(
                        `${modal.player.active ? 'Archivar' : 'Restaurar'} a ${modal.player.name}? Se conservará todo su historial.`,
                      )
                    )
                      void send('archive', { id: modal.player.id }).then((ok) => {
                        if (ok) setModal(null);
                      });
                  }}
                >
                  {modal.player.active ? 'Archivar' : 'Restaurar'}
                </button>
              </div>
            )}
          </>
        ) : (
          modal && (
            <form onSubmit={submitModal}>
              {modal.type === 'catalog' && (
                <>
                  <h2>
                    {modal.kind === 'season'
                      ? 'Otra temporada. Nuevas metas.'
                      : modal.kind === 'club'
                        ? 'Un nuevo club.'
                        : 'Un equipo más.'}
                  </h2>
                  <p>Los partidos y estadísticas de temporadas anteriores se conservan.</p>
                  {modal.kind === 'club' && field('Nombre del club', 'clubName')}
                  {field(
                    'Nombre del equipo',
                    'name',
                    modal.kind === 'season' ? state.team : undefined,
                  )}
                  {field('Categoría', 'category', state.category)}
                  {field(
                    'Nombre de la temporada',
                    'season',
                    modal.kind === 'season' ? '2027 / 2028' : state.season,
                  )}
                  <div className="form-grid">
                    {field(
                      'Inicio',
                      'startsAt',
                      modal.kind === 'season' ? '2027-09-01' : '2026-09-01',
                      'date',
                    )}
                    {field(
                      'Fin',
                      'endsAt',
                      modal.kind === 'season' ? '2028-07-01' : '2027-07-01',
                      'date',
                    )}
                  </div>
                  {modal.kind === 'season' && (
                    <label className="check-label">
                      <input name="carryRoster" type="checkbox" defaultChecked />
                      Copiar plantilla actual sin modificar su histórico
                    </label>
                  )}
                </>
              )}
              {modal.type === 'player' && (
                <>
                  <h2>{modal.player ? 'Editar jugador' : 'Una nueva incorporación.'}</h2>
                  <p>El dorsal es único entre jugadores activos de la temporada.</p>
                  <div className="form-grid">
                    {field('Nombre visible', 'name', modal.player?.name)}
                    <label>
                      Dorsal
                      <input
                        name="number"
                        type="number"
                        min="0"
                        max="99"
                        defaultValue={modal.player?.number}
                        required
                      />
                    </label>
                  </div>
                  <label>
                    Posición
                    <select name="position" defaultValue={modal.player?.position || 'Base'}>
                      {['Base', 'Escolta', 'Alero', 'Ala-pívot', 'Pívot'].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Foto (opcional, PNG, JPEG o WebP, máximo 5 MB)
                    <input name="photo" type="file" accept="image/png,image/jpeg,image/webp" />
                  </label>
                </>
              )}
              {modal.type === 'game' && (
                <>
                  <h2>{modal.game ? 'Editar partido programado.' : 'Un nuevo reto.'}</h2>
                  {modal.game && (
                    <p>
                      Modifica los datos del encuentro antes de la fecha programada.
                    </p>
                  )}
                  {field('Equipo rival', 'opponent', modal.game?.opponent)}
                  <div className="form-grid">
                    {field(
                      'Fecha y hora (zona del dispositivo)',
                      'date',
                      toDatetimeLocal(modal.game?.date),
                      'datetime-local',
                    )}
                    <label>
                      Sede
                      <select name="venue" defaultValue={modal.game?.venue || 'HOME'}>
                        <option value="HOME">Casa</option>
                        <option value="AWAY">Fuera</option>
                        <option value="NEUTRAL">Neutral</option>
                      </select>
                    </label>
                  </div>
                  {field('Competición / jornada', 'competition', modal.game?.competition || 'Liga')}
                  <div className="form-grid three">
                    <label>
                      Periodos
                      <input
                        name="periods"
                        type="number"
                        min="1"
                        max="12"
                        defaultValue={modal.game?.rules.periods ?? 4}
                        required
                      />
                    </label>
                    <label>
                      Min / periodo
                      <input
                        name="minutes"
                        type="number"
                        min="1"
                        max="60"
                        defaultValue={modal.game ? Math.floor(modal.game.rules.periodSeconds / 60) : 10}
                        required
                      />
                    </label>
                    <label>
                      Min / prórroga
                      <input
                        name="overtime"
                        type="number"
                        min="1"
                        max="20"
                        defaultValue={modal.game ? Math.floor(modal.game.rules.overtimeSeconds / 60) : 5}
                        required
                      />
                    </label>
                  </div>
                  <p className="inline-note">
                    Se guarda la fecha en UTC y se muestra en Europe/Madrid. Todos los jugadores
                    activos se convocan inicialmente.
                  </p>
                </>
              )}
              {modal.type === 'roster' && (
                <>
                  <h2>Preparar la convocatoria.</h2>
                  <p>
                    Selecciona entre 5 y 30 jugadores. Las participaciones registradas se conservan.
                  </p>
                  <div className="lineup-options">
                    {state.players
                      .filter((p) => p.active || modal.game.roster.includes(p.id))
                      .map((p) => (
                        <label key={p.id}>
                          <input
                            type="checkbox"
                            name="roster"
                            value={p.id}
                            defaultChecked={modal.game.roster.includes(p.id)}
                          />
                          <span className="jersey">{p.number}</span>
                          {p.name}
                        </label>
                      ))}
                  </div>
                </>
              )}
              {modal.type === 'lineup' && (
                <>
                  <h2>Cinco en pista.</h2>
                  <p>
                    Selecciona exactamente cinco convocados. El cambio se registra en el instante
                    actual del reloj.
                  </p>
                  <div className="lineup-options">
                    {state.players
                      .filter((p) => modal.game.roster.includes(p.id))
                      .map((p) => (
                        <label key={p.id}>
                          <input
                            type="checkbox"
                            name="lineup"
                            value={p.id}
                            defaultChecked={reduceGameEvents(modal.game).lineup.includes(p.id)}
                          />
                          <span className="jersey">{p.number}</span>
                          {p.name}
                        </label>
                      ))}
                  </div>
                </>
              )}
              {modal.type === 'undo' && (
                <>
                  <h2>Anular una acción.</h2>
                  <p>
                    La acción permanece auditada. El marcador y todas las métricas se recalcularán.
                  </p>
                  {field('Motivo obligatorio', 'reason')}
                </>
              )}
              {modal.type === 'reopen' && (
                <>
                  <h2>Reabrir el partido.</h2>
                  <p>Se habilitarán las correcciones y quedará registro de la reapertura.</p>
                  {field('Motivo obligatorio', 'reason')}
                </>
              )}
              {modal.type === 'finalize' && (
                <>
                  <h2>Cerrar con todo en orden.</h2>
                  <p>
                    Confirma el marcador oficial. Se comprobarán reloj, periodos, quintetos y
                    minutos antes de finalizar.
                  </p>
                  <div className="form-grid">
                    {field('Puntos CDIR', 'ours', reduceGameEvents(modal.game).ours, 'number')}
                    {field(
                      'Puntos rival',
                      'opponent',
                      reduceGameEvents(modal.game).opponent,
                      'number',
                    )}
                  </div>
                  <p className="inline-note">
                    Duración registrada: {time(modal.game.elapsed)} · periodo {modal.game.period} de{' '}
                    {modal.game.rules.periods}. Reloj restante: {time(modal.game.remaining)}.
                  </p>
                </>
              )}
              <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? 'Guardando…' : 'Confirmar y guardar'}
                  <Check size={16} />
                </button>
              </div>
            </form>
          )
        )}
      </dialog>
    </div>
  );
}
