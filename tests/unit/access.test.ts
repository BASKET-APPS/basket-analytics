import { beforeEach, describe, it, expect, vi } from 'vitest';
import { ObjectId } from 'mongodb';
const mocks = vi.hoisted(() => ({ session: vi.fn(), membership: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  isDemo: () => false,
  getAuth: async () => ({ api: { getSession: mocks.session } }),
}));
vi.mock('@/lib/mongodb', () => ({
  getDb: async () => ({ collection: () => ({ findOne: mocks.membership }) }),
}));
import { access } from '@/server/access';
const userId = new ObjectId(),
  teamA = new ObjectId(),
  teamB = new ObjectId();
describe('Autorización MongoDB por equipo', () => {
  beforeEach(() => {
    vi.stubEnv('MONGODB_URI', 'mongodb://local-test');
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-minimum-32-characters-long');
    mocks.session.mockResolvedValue({ user: { id: userId.toHexString(), name: 'Usuario A' } });
    mocks.membership.mockReset();
  });
  it('un usuario de A no puede consultar B', async () => {
    mocks.membership.mockResolvedValue(null);
    await expect(
      access(new Request(`http://localhost:3001/api/workspace?teamId=${teamB}`)),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.membership).toHaveBeenCalledWith({ userId, teamId: teamB });
  });
  it('rechaza sin sesión antes de consultar membresías', async () => {
    mocks.session.mockResolvedValue(null);
    await expect(access(new Request('http://localhost:3001/api/workspace'))).rejects.toMatchObject({
      status: 401,
    });
    expect(mocks.membership).not.toHaveBeenCalled();
  });
  it('el rol viene del servidor, no del cliente', async () => {
    mocks.membership.mockResolvedValue({ teamId: teamA, role: 'READER' });
    expect((await access(new Request('http://localhost:3001/api/workspace?role=ADMIN'))).role).toBe(
      'READER',
    );
  });
  it('rechaza operadores o identificadores manipulados', async () => {
    await expect(
      access(
        new Request(
          'http://localhost:3001/api/workspace?teamId[$ne]=1&teamId=%7B%22%24ne%22%3A1%7D',
        ),
      ),
    ).rejects.toThrow();
  });
});

it('bloquea equipos borrados pero permite al catálogo gestionar su recuperación', async () => {
  vi.stubEnv('MONGODB_URI', 'mongodb://local-test');
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-minimum-32-characters-long');
  mocks.session.mockResolvedValue({ user: { id: userId.toHexString(), name: 'Usuario A' } });
  mocks.membership.mockReset();
  mocks.membership
    .mockResolvedValueOnce({ teamId: teamA, role: 'ADMIN' })
    .mockResolvedValueOnce({ isActive: false });
  await expect(
    access(new Request(`http://localhost:3001/api/workspace?teamId=${teamA}`)),
  ).rejects.toMatchObject({ status: 410 });
  mocks.membership.mockResolvedValue({ teamId: teamA, role: 'ADMIN' });
  expect(
    (
      await access(new Request(`http://localhost:3001/api/catalog?teamId=${teamA}`), {
        allowDeletedTeam: true,
      })
    ).role,
  ).toBe('ADMIN');
});
