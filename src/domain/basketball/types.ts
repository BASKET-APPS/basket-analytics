export type Venue = 'HOME' | 'AWAY' | 'NEUTRAL';
export type Role = 'ADMIN' | 'COACH' | 'SCORER' | 'READER';
export interface Player {
  id: string;
  name: string;
  number: number;
  position: string;
  active: boolean;
  photo?: string;
}
export interface Rules {
  periods: number;
  periodSeconds: number;
  overtimeSeconds: number;
}
export const defaultRules: Rules = { periods: 4, periodSeconds: 600, overtimeSeconds: 300 };
export const actions = {
  SHOT_2_MADE: 'T2 anotado',
  SHOT_2_MISSED: 'T2 fallado',
  SHOT_3_MADE: 'T3 anotado',
  SHOT_3_MISSED: 'T3 fallado',
  FREE_THROW_MADE: 'TL anotado',
  FREE_THROW_MISSED: 'TL fallado',
  DEF_REBOUND: 'Rebote defensivo',
  OFF_REBOUND: 'Rebote ofensivo',
  ASSIST: 'Asistencia',
  STEAL: 'Recuperación',
  TURNOVER: 'Pérdida',
  BLOCK_FOR: 'Tapón a favor',
  BLOCK_AGAINST: 'Tapón recibido',
  FOUL_COMMITTED: 'Falta cometida',
  FOUL_DRAWN: 'Falta recibida',
} as const;
export type Action = keyof typeof actions;
export const SHOWCASE_COMPETITION = 'DEMO · Presentación';
export interface GameEvent {
  id: string;
  mutationId: string;
  sequence: number;
  type: Action | 'OPPONENT_SCORE' | 'LINEUP_SET' | 'SUBSTITUTION';
  playerId?: string;
  points?: number;
  lineup?: string[];
  onCourtPlayerIds?: string[];
  period: number;
  remaining: number;
  elapsed: number;
  voided?: boolean;
  reason?: string;
  createdBy: string;
  createdAt: string;
}
export interface Game {
  id: string;
  opponent: string;
  date: string;
  timezone: string;
  venue: Venue;
  competition: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINAL' | 'CANCELLED';
  roster: string[];
  rules: Rules;
  period: number;
  remaining: number;
  elapsed: number;
  events: GameEvent[];
  version: number;
  isPractice?: boolean;
}
export interface Audit {
  actorId?: string;
  mutationId?: string;
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}
export interface AppState {
  isSandbox?: boolean;
  teamId: string;
  seasonId?: string;
  team: string;
  category: string;
  season: string;
  club: string;
  version: number;
  players: Player[];
  games: Game[];
  audit: Audit[];
}
export interface Stats {
  Min: number;
  Pts: number;
  T2A: number;
  T2I: number;
  'T2%': number | null;
  T3A: number;
  T3I: number;
  'T3%': number | null;
  T1A: number;
  T1I: number;
  'T1%': number | null;
  DReb: number;
  OReb: number;
  TReb: number;
  Asis: number;
  Rec: number;
  Per: number;
  TapF: number;
  TapC: number;
  Falt: number;
  FaltR: number;
  Val: number;
  Partidos: number;
  '+/-': number | null;
}
export const columns: (keyof Stats)[] = [
  'Min',
  'Pts',
  'T2A',
  'T2I',
  'T2%',
  'T3A',
  'T3I',
  'T3%',
  'T1A',
  'T1I',
  'T1%',
  'DReb',
  'OReb',
  'TReb',
  'Asis',
  'Rec',
  'Per',
  'TapF',
  'TapC',
  'Falt',
  'FaltR',
  'Val',
  'Partidos',
  '+/-',
];
export const venueNames: Record<Venue, string> = {
  HOME: 'Casa',
  AWAY: 'Fuera',
  NEUTRAL: 'Neutral',
};
