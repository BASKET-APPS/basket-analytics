import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { access, checkOrigin } from '@/server/access';
import { AppError } from '@/server/repository';
import { canWrite } from '@/lib/permissions';
import { demoDirectory } from '@/server/demo-path';

export const runtime = 'nodejs';
const directory = process.env.PLAYER_MEDIA_DIR || path.join(demoDirectory, 'player-photos');
function failure(error: unknown) {
  return Response.json(
    { error: error instanceof AppError ? error.message : 'No se ha podido procesar la foto' },
    { status: error instanceof AppError ? error.status : 500 },
  );
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const identity = await access(request);
    if (!canWrite(identity.role, 'player'))
      throw new AppError(403, 'No tienes permiso para editar fotos');
    if (Number(request.headers.get('content-length')) > 5_300_000)
      throw new AppError(413, 'La foto debe ocupar menos de 5 MB');
    const file = (await request.formData()).get('photo');
    if (!(file instanceof File) || !file.size || file.size > 5_000_000)
      throw new AppError(400, 'Selecciona una foto de menos de 5 MB');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
      throw new AppError(400, 'Usa una imagen PNG, JPEG o WebP');
    let image: Buffer;
    try {
      image = await sharp(Buffer.from(await file.arrayBuffer()), {
        limitInputPixels: 25_000_000,
        animated: false,
      })
        .rotate()
        .resize(512, 640, { fit: 'cover' })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new AppError(400, 'El contenido de la imagen no es válido');
    }
    const id = randomUUID();
    const folder = path.join(directory, identity.teamId);
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, `${id}.webp`), image, { flag: 'wx' });
    return Response.json(
      { photo: `/api/player-photo?teamId=${identity.teamId}&id=${id}` },
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function GET(request: Request) {
  try {
    const identity = await access(request);
    const id = new URL(request.url).searchParams.get('id') || '';
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id))
      throw new AppError(400, 'Foto no válida');
    let image: Buffer;
    try {
      image = await readFile(path.join(directory, identity.teamId, `${id}.webp`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new AppError(404, 'Foto no encontrada');
      throw error;
    }
    return new Response(new Uint8Array(image), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return failure(error);
  }
}
