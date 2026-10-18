import { access } from '@/server/access';
import { getDb } from '@/lib/mongodb';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const identity = await access(request);
    if (identity.role !== 'ADMIN')
      return Response.json({ error: 'Acceso restringido' }, { status: 403 });
    if (identity.demo)
      return Response.json(
        { storage: 'local-demo', mongodb: 'not-connected' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    await (await getDb()).command({ ping: 1 });
    return Response.json(
      { storage: 'mongodb', status: 'connected' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'No se ha podido verificar el acceso a MongoDB' },
      { status: 503 },
    );
  }
}
