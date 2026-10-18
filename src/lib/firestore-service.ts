import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth, googleProvider, db } from './firebase';
import type { AppState, Game, Player, Role } from '@/domain/basketball/types';
import type { CatalogEntry } from '@/server/catalog';
import { applyCommand, type Command } from '@/server/service';
import { newId } from './ids';
import initialDump from './migrated-data.json';

export interface AppUser {
  email: string;
  name: string;
  role: 'ADMIN' | 'NORMAL';
  createdAt: string;
  createdBy?: string;
}

export const SUPER_ADMIN_EMAIL = 'juankiavila752@gmail.com';

// ================= AUTHENTICATION & USERS =================

export async function loginWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function resolveUserRole(
  user: User
): Promise<{ role: Role; isAuthorized: boolean; appUser: AppUser }> {
  const email = (user.email || '').toLowerCase().trim();
  const isSuper = email === SUPER_ADMIN_EMAIL.toLowerCase();

  const userRef = doc(db, 'app_users', email);
  const snap = await getDoc(userRef);

  if (isSuper) {
    const adminData: AppUser = {
      email,
      name: user.displayName || 'Juanki Ávila',
      role: 'ADMIN',
      createdAt: snap.exists() ? snap.data().createdAt : new Date().toISOString(),
      createdBy: 'system',
    };
    if (!snap.exists()) {
      await setDoc(userRef, adminData);
    }
    return { role: 'ADMIN', isAuthorized: true, appUser: adminData };
  }

  if (snap.exists()) {
    const data = snap.data() as AppUser;
    const role: Role = data.role === 'ADMIN' ? 'ADMIN' : 'COACH';
    return { role, isAuthorized: true, appUser: data };
  }

  return {
    role: 'READER',
    isAuthorized: false,
    appUser: {
      email,
      name: user.displayName || email,
      role: 'NORMAL',
      createdAt: new Date().toISOString(),
    },
  };
}

export async function listAppUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'app_users'));
  const users: AppUser[] = [];
  snap.forEach((d) => users.push(d.data() as AppUser));
  return users.sort((a, b) => a.email.localeCompare(b.email));
}

export async function addOrUpdateAppUser(
  email: string,
  role: 'ADMIN' | 'NORMAL',
  name = '',
  adminEmail = ''
): Promise<void> {
  const normalized = email.toLowerCase().trim();
  const ref = doc(db, 'app_users', normalized);
  await setDoc(
    ref,
    {
      email: normalized,
      name: name.trim() || normalized.split('@')[0],
      role,
      createdAt: new Date().toISOString(),
      createdBy: adminEmail,
    },
    { merge: true }
  );
}

export async function removeAppUser(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  if (normalized === SUPER_ADMIN_EMAIL.toLowerCase()) {
    throw new Error('No se puede eliminar al administrador principal');
  }
  await deleteDoc(doc(db, 'app_users', normalized));
}

// ================= MIGRATION FROM DUMP =================

export async function seedFromMongoDumpIfEmpty(): Promise<boolean> {
  const catalogSnap = await getDocs(collection(db, 'catalog_entries'));
  if (!catalogSnap.empty) return false;

  console.log('Inicializando Firestore con datos migrados de MongoDB...');
  const states = initialDump as unknown as AppState[];

  for (const s of states) {
    const teamRef = doc(db, 'teams', s.teamId);
    await setDoc(teamRef, {
      id: s.teamId,
      name: s.team,
      club: s.club,
      category: s.category,
      isSandbox: !!s.isSandbox,
      isActive: true,
      createdAt: new Date().toISOString(),
    });

    const catalogRef = doc(db, 'catalog_entries', `${s.teamId}_${s.seasonId}`);
    const catalogEntry: CatalogEntry = {
      teamId: s.teamId,
      seasonId: s.seasonId!,
      team: s.team,
      club: s.club,
      season: s.season,
      role: 'ADMIN',
      category: s.category,
      isSandbox: s.isSandbox,
    };
    await setDoc(catalogRef, catalogEntry);

    const seasonRef = doc(db, 'seasons', s.seasonId!);
    await setDoc(seasonRef, {
      teamId: s.teamId,
      seasonId: s.seasonId,
      team: s.team,
      category: s.category,
      season: s.season,
      club: s.club,
      version: s.version,
      isSandbox: !!s.isSandbox,
      players: s.players || [],
      audit: s.audit || [],
      createdAt: new Date().toISOString(),
    });

    // Guardar los partidos en la subcolección seasons/{seasonId}/games/{gameId}
    if (s.games?.length) {
      for (const g of s.games) {
        const gameRef = doc(db, 'seasons', s.seasonId!, 'games', g.id);
        await setDoc(gameRef, g);
      }
    }
  }

  // Dar de alta al super admin en app_users
  const adminRef = doc(db, 'app_users', SUPER_ADMIN_EMAIL.toLowerCase());
  await setDoc(adminRef, {
    email: SUPER_ADMIN_EMAIL.toLowerCase(),
    name: 'Juanki Ávila',
    role: 'ADMIN',
    createdAt: new Date().toISOString(),
    createdBy: 'system',
  });

  return true;
}

// ================= CATALOG =================

export async function fetchCatalog(): Promise<CatalogEntry[]> {
  const snap = await getDocs(collection(db, 'catalog_entries'));
  const entries: CatalogEntry[] = [];
  snap.forEach((d) => entries.push(d.data() as CatalogEntry));
  return entries;
}

export async function createCatalogItem(
  input: {
    type: 'team' | 'season' | 'club';
    name: string;
    category: string;
    season: string;
    startsAt: string;
    endsAt: string;
    clubName?: string;
    carryRoster?: boolean;
  },
  currentSeasonId?: string
): Promise<CatalogEntry> {
  let previous: AppState | null = null;
  if (currentSeasonId) {
    try {
      previous = await loadState('', currentSeasonId);
    } catch {}
  }

  const teamId = input.type === 'season' && previous ? previous.teamId : newId();
  const seasonId = newId();

  const entry: CatalogEntry = {
    teamId,
    seasonId,
    team: input.type === 'season' && previous ? previous.team : input.name,
    club:
      input.type === 'season' && previous
        ? previous.club
        : input.clubName || (input.type === 'club' ? input.name : previous?.club || input.name),
    category: input.category || previous?.category || 'Sénior',
    season: input.season,
    role: 'ADMIN',
  };

  const players =
    input.type === 'season' && input.carryRoster && previous?.players
      ? structuredClone(previous.players)
      : [];

  // Guardar en Firestore
  if (input.type !== 'season') {
    await setDoc(doc(db, 'teams', teamId), {
      id: teamId,
      name: entry.team,
      club: entry.club,
      category: entry.category,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
  }

  await setDoc(doc(db, 'catalog_entries', `${teamId}_${seasonId}`), entry);

  await setDoc(doc(db, 'seasons', seasonId), {
    teamId,
    seasonId,
    team: entry.team,
    category: entry.category,
    season: entry.season,
    club: entry.club,
    version: 0,
    players,
    audit: [
      {
        id: newId(),
        actor: 'Administrador',
        at: new Date().toISOString(),
        action: 'catalog',
        detail: 'Equipo y temporada creados',
      },
    ],
    createdAt: new Date().toISOString(),
  });

  return entry;
}

export async function setTeamTrash(teamId: string, deleted: boolean): Promise<void> {
  const now = new Date().toISOString();
  await updateDoc(doc(db, 'teams', teamId), {
    isActive: !deleted,
    deletedAt: deleted ? now : null,
  });

  const catalogSnap = await getDocs(collection(db, 'catalog_entries'));
  const batch = writeBatch(db);
  catalogSnap.forEach((d) => {
    const entry = d.data() as CatalogEntry;
    if (entry.teamId === teamId) {
      batch.update(d.ref, { deletedAt: deleted ? now : null });
    }
  });
  await batch.commit();
}

// ================= STATE & LIVE GAMES =================

export async function loadState(teamId: string, seasonId: string): Promise<AppState> {
  const seasonRef = doc(db, 'seasons', seasonId);
  const seasonSnap = await getDoc(seasonRef);

  if (!seasonSnap.exists()) {
    throw new Error('Temporada no encontrada en Firestore');
  }

  const seasonData = seasonSnap.data();
  const gamesSnap = await getDocs(collection(db, 'seasons', seasonId, 'games'));
  const games: Game[] = [];
  gamesSnap.forEach((d) => games.push(d.data() as Game));

  return {
    teamId: seasonData.teamId || teamId,
    seasonId,
    team: seasonData.team,
    category: seasonData.category,
    season: seasonData.season,
    club: seasonData.club,
    version: seasonData.version || 0,
    isSandbox: seasonData.isSandbox || false,
    players: seasonData.players || [],
    games: games.sort((a, b) => a.date.localeCompare(b.date)),
    audit: seasonData.audit || [],
  };
}

export function subscribeToSeason(
  seasonId: string,
  onStateUpdate: (state: AppState) => void
): () => void {
  const seasonRef = doc(db, 'seasons', seasonId);
  const gamesRef = collection(db, 'seasons', seasonId, 'games');

  let currentSeasonData: Record<string, unknown> | null = null;
  let currentGames: Game[] = [];

  const emit = () => {
    if (!currentSeasonData) return;
    onStateUpdate({
      teamId: String(currentSeasonData.teamId || ''),
      seasonId,
      team: String(currentSeasonData.team || ''),
      category: String(currentSeasonData.category || ''),
      season: String(currentSeasonData.season || ''),
      club: String(currentSeasonData.club || ''),
      version: Number(currentSeasonData.version || 0),
      isSandbox: Boolean(currentSeasonData.isSandbox || false),
      players: (currentSeasonData.players as Player[]) || [],
      games: [...currentGames].sort((a, b) => a.date.localeCompare(b.date)),
      audit: (currentSeasonData.audit as AppState['audit']) || [],
    });
  };

  const unsubSeason = onSnapshot(seasonRef, (snap) => {
    if (snap.exists()) {
      currentSeasonData = snap.data();
      emit();
    }
  });

  const unsubGames = onSnapshot(gamesRef, (snap) => {
    const list: Game[] = [];
    snap.forEach((d) => list.push(d.data() as Game));
    currentGames = list;
    emit();
  });

  return () => {
    unsubSeason();
    unsubGames();
  };
}

export async function executeAndPersistCommand(
  currentState: AppState,
  command: Command,
  actor: string,
  role: Role,
  actorUserId?: string
): Promise<AppState> {
  const next = structuredClone(currentState);

  // 1. Ejecutar la lógica de negocio y validación
  applyCommand(next, command, actor, role, actorUserId);
  next.version++;

  const seasonId = next.seasonId!;

  // 2. Persistir en Firestore de forma granular
  const seasonRef = doc(db, 'seasons', seasonId);

  if (command.action === 'game' || command.action === 'practice' || command.action === 'showcase') {
    // Nuevos partidos agregados
    for (const g of next.games) {
      const existing = currentState.games.find((x) => x.id === g.id);
      if (!existing || existing.version !== g.version) {
        await setDoc(doc(db, 'seasons', seasonId, 'games', g.id), g);
      }
    }
    await updateDoc(seasonRef, {
      version: next.version,
      audit: next.audit,
    });
  } else if (
    [
      'event',
      'lineup',
      'clock',
      'period',
      'start',
      'finalize',
      'reopen',
      'roster',
      'undo',
      'prepare',
    ].includes(command.action)
  ) {
    // Modificación de un partido específico
    const g = next.games.find((x) => x.id === command.gameId);
    if (g) {
      await setDoc(doc(db, 'seasons', seasonId, 'games', g.id), g);
    }
    await updateDoc(seasonRef, {
      version: next.version,
      audit: next.audit,
    });
  } else if (command.action === 'player' || command.action === 'archive') {
    // Plantilla de jugadores
    await updateDoc(seasonRef, {
      players: next.players,
      audit: next.audit,
      version: next.version,
    });
  } else if (command.action === 'team') {
    // Datos del equipo
    await updateDoc(seasonRef, {
      team: next.team,
      category: next.category,
      audit: next.audit,
      version: next.version,
    });
    // Actualizar también la entrada en el catálogo
    await updateDoc(doc(db, 'catalog_entries', `${next.teamId}_${seasonId}`), {
      team: next.team,
      category: next.category,
    });
    await updateDoc(doc(db, 'teams', next.teamId), {
      name: next.team,
      category: next.category,
    });
  }

  return next;
}
