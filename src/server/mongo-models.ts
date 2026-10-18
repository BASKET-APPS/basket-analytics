import type { Document, ObjectId } from 'mongodb';
import type {
  AppState,
  Game,
  Player,
  Audit,
  GameEvent,
  Rules,
  Role,
} from '@/domain/basketball/types';
export interface TeamDoc extends Document {
  deletedAt?: Date;
  deletedBy?: string;
  isSandbox?: boolean;
  _id: ObjectId;
  name: string;
  club: string;
  category: string;
  isActive: boolean;
  createdAt: Date;
}
export interface SeasonDoc extends Document {
  _id: ObjectId;
  teamId: ObjectId;
  name: string;
  startDate: Date;
  endDate: Date;
  version: number;
  teamName?: string;
  category?: string;
  pending?: WriteIntent;
  createdAt: Date;
}
export interface PlayerDoc extends Document {
  _id: ObjectId;
  fullName: string;
  position: string;
  photoUrl?: string;
  createdAt: Date;
}
export interface RosterDoc extends Document {
  _id: ObjectId;
  teamId: ObjectId;
  seasonId: ObjectId;
  playerId: ObjectId;
  jerseyNumber: number;
  status: 'ACTIVE' | 'ARCHIVED';
  displayName: string;
  position: string;
  photoUrl?: string;
  sourceVersion: number;
}
export interface MatchDoc extends Document {
  _id: ObjectId;
  teamId: ObjectId;
  seasonId: ObjectId;
  opponentName: string;
  startsAt: Date;
  timezone: string;
  venueType: Game['venue'];
  status: Game['status'];
  rosterPlayerIds: ObjectId[];
  rules: Rules;
  period: number;
  clockSecondsRemaining: number;
  elapsedSeconds: number;
  version: number;
  sourceVersion: number;
  competition: string;
  isPractice: boolean;
  scoreFor: number;
  scoreAgainst: number;
  lineupPlayerIds: ObjectId[];
}
export interface EventDoc extends Document {
  _id: ObjectId;
  matchId: ObjectId;
  teamId: ObjectId;
  seasonId: ObjectId;
  clientEventId: string;
  sequence: number;
  period: number;
  elapsedMs: number;
  remainingSeconds: number;
  side: 'FOR' | 'AGAINST';
  playerId?: ObjectId;
  type: GameEvent['type'];
  points?: number;
  lineupPlayerIds?: ObjectId[];
  onCourtPlayerIds: ObjectId[];
  voidedAt: Date | null;
  reason?: string;
  createdBy: string;
  createdAt: Date;
  sourceVersion: number;
}
export interface MembershipDoc extends Document {
  _id: ObjectId;
  teamId: ObjectId;
  userId: ObjectId;
  role: Role;
}
export interface WriteIntent {
  changedEventIds?: string[];
  token: string;
  version: number;
  createdAt: Date;
  players: Player[];
  games: Game[];
  audit: Audit[];
  metadata: { team: string; category: string };
}
export type WorkspaceChange = { before: AppState; after: AppState };
