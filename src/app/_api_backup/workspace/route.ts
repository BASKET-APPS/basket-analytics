import { AppError, readState, mutateState } from '@/server/repository';
import { access, checkOrigin } from '@/server/access';
import { commandSchema, applyCommand } from '@/server/service';
import { ZodError } from 'zod';
export const runtime = 'nodejs';
function failure(error: unknown) {
  if (error instanceof AppError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError)
    return Response.json({ error: error.issues.map((i) => i.message).join('; ') }, { status: 400 });
  console.error('workspace_error', error instanceof Error ? error.name : 'unknown');
  return Response.json(
    { error: 'No se ha podido guardar. Reintenta la operación.' },
    { status: 500 },
  );
}
export async function GET(request: Request) {
  try {
    const identity = await access(request);
    return Response.json(
      { state: await readState(identity.teamId, identity.seasonId), identity },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (Number(request.headers.get('content-length') || 0) > 450000)
      throw new AppError(413, 'Archivo demasiado grande');
    const identity = await access(request);
    const text = await request.text();
    if (text.length > 450000) throw new AppError(413, 'Solicitud demasiado grande');
    const command = commandSchema.parse(JSON.parse(text));
    const state = await mutateState(
      identity.teamId,
      command.version,
      (s) => applyCommand(s, command, identity.actor, identity.role, identity.userId),
      identity.seasonId,
      {
        gameId: command.action === 'practice' ? undefined : command.gameId,
        mutationId: command.mutationId,
      },
    );
    return Response.json({ state, identity });
  } catch (e) {
    return failure(e);
  }
}
