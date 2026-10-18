import { access, checkOrigin } from '@/server/access';
import { listCatalog, createCatalog, catalogSchema, setTeamDeleted } from '@/server/catalog';
import { AppError } from '@/server/repository';
import { ZodError } from 'zod';
export const runtime = 'nodejs';
function failure(e: unknown) {
  return Response.json(
    {
      error:
        e instanceof AppError || e instanceof ZodError
          ? e.message
          : 'No se ha podido cargar el catálogo',
    },
    { status: e instanceof AppError ? e.status : e instanceof ZodError ? 400 : 500 },
  );
}
export async function GET(request: Request) {
  try {
    return Response.json(
      { entries: await listCatalog(await access(request, { allowDeletedTeam: true })) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const identity = await access(request, { allowDeletedTeam: true });
    return Response.json({
      entry: await createCatalog(identity, catalogSchema.parse(await request.json())),
    });
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    if (!new URL(request.url).searchParams.get('teamId'))
      throw new AppError(400, 'Selecciona el equipo');
    await setTeamDeleted(await access(request, { allowDeletedTeam: true }), true);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    if (!new URL(request.url).searchParams.get('teamId'))
      throw new AppError(400, 'Selecciona el equipo');
    await setTeamDeleted(await access(request, { allowDeletedTeam: true }), false);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
