import { getAuth, isDemo } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { entityId, objectId } from '@/lib/ids';
import type { MembershipDoc } from './mongo-models';
import { teamId as demoTeamId } from '@/lib/seed';
import { AppError } from './repository';
import type { Role } from '@/domain/basketball/types';
import { z } from 'zod';
import { demoCatalog } from './catalog';
export async function access(request: Request, options: { allowDeletedTeam?: boolean } = {}) {
  const url = new URL(request.url);
  const requested = url.searchParams.get('teamId');
  const seasonId = url.searchParams.get('seasonId') || undefined;
  if (requested) entityId.parse(requested);
  if (seasonId) entityId.parse(seasonId);
  const checkTeam = async (teamId: string, demo = false) => {
    // The implicit read bootstraps the team selector even when its former default is in the trash.
    if (options.allowDeletedTeam || (!requested && request.method === 'GET')) return;
    const deleted = demo
      ? (await demoCatalog()).find((entry) => entry.teamId === teamId)?.deletedAt
      : (await (await getDb()).collection('teams').findOne({ _id: objectId(teamId) }))?.isActive ===
        false;
    if (deleted)
      throw new AppError(
        410,
        'Este equipo está en la papelera. Un administrador puede restaurarlo.',
      );
  };
  if (isDemo()) {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new AppError(403, 'Demo disponible solo en localhost');
    await checkTeam(requested || demoTeamId, true);
    return {
      teamId: requested || demoTeamId,
      seasonId,
      actor: 'Entrenador demo',
      role: 'ADMIN' as Role,
      demo: true,
      userId: 'demo',
    };
  }
  if (!process.env.MONGODB_URI || !process.env.BETTER_AUTH_SECRET)
    throw new AppError(
      503,
      'Configura MongoDB Atlas y autenticación para habilitar el espacio de trabajo',
    );
  if (process.env.LOCAL_MONGO_MODE === 'true' && process.env.NODE_ENV !== 'production') {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new AppError(403, 'El acceso local a Atlas solo está disponible en este ordenador');
    const db = await getDb();
    const user = await db
      .collection('users')
      .findOne({ authProviderId: 'local-development-admin' });
    if (!user) throw new AppError(503, 'Ejecuta el seed local de MongoDB antes de abrir el equipo');
    const localTeam = requested || process.env.LOCAL_TEAM_ID;
    const membership = await db
      .collection<MembershipDoc>('team_memberships')
      .findOne({ userId: user._id, ...(localTeam ? { teamId: objectId(localTeam) } : {}) });
    if (!membership)
      throw new AppError(403, 'El administrador local no tiene acceso a este equipo');
    await checkTeam(membership.teamId.toHexString());
    return {
      teamId: membership.teamId.toHexString(),
      seasonId,
      actor: 'Administrador local',
      role: membership.role,
      demo: false,
      userId: user._id.toHexString(),
      local: true,
    };
  }
  const session = await (await getAuth()).api.getSession({ headers: request.headers });
  if (!session) throw new AppError(401, 'Inicia sesión para acceder');
  const member = await (await getDb()).collection<MembershipDoc>('team_memberships').findOne({
    userId: objectId(session.user.id),
    ...(requested ? { teamId: objectId(requested) } : {}),
  });
  if (!member || !['ADMIN', 'COACH', 'SCORER', 'READER'].includes(member.role))
    throw new AppError(
      403,
      'Tu cuenta no tiene acceso a este equipo. Solicita el alta al administrador.',
    );
  await checkTeam(member.teamId.toHexString());
  return {
    teamId: member.teamId.toHexString(),
    seasonId,
    actor: session.user.name,
    role: member.role as Role,
    demo: false,
    userId: session.user.id,
  };
}
export function checkOrigin(request: Request) {
  const port = process.env.DEMO_PORT || '3001';
  const allowed =
    isDemo() || (process.env.LOCAL_MONGO_MODE === 'true' && process.env.NODE_ENV !== 'production')
      ? ['http://127.0.0.1:' + port, 'http://localhost:' + port]
      : [new URL(process.env.BETTER_AUTH_URL || request.url).origin];
  if (!allowed.includes(request.headers.get('origin') || ''))
    throw new AppError(403, 'Origen no permitido');
}
