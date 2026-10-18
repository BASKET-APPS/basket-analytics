import { getAuth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';
async function handler(request: Request) {
  if (
    !process.env.MONGODB_URI ||
    !process.env.BETTER_AUTH_SECRET ||
    !process.env.GITHUB_CLIENT_ID ||
    !process.env.GITHUB_CLIENT_SECRET
  )
    return Response.json(
      { error: 'Configura MongoDB Atlas y el proveedor GitHub para habilitar el acceso' },
      { status: 503 },
    );
  return toNextJsHandler(await getAuth())[request.method === 'GET' ? 'GET' : 'POST'](request);
}
export const runtime = 'nodejs';
export const GET = handler;
export const POST = handler;
