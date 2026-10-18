import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { getDb } from './mongodb';
const createAuth = async () =>
  betterAuth({
    database: mongodbAdapter(await getDb()),
    user: { modelName: 'users' },
    session: { modelName: 'sessions' },
    account: { modelName: 'accounts' },
    verification: { modelName: 'verifications' },
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3001',
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      },
    },
  });
let instance: ReturnType<typeof createAuth> | undefined;
export async function getAuth() {
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32)
    throw Error('Configura BETTER_AUTH_SECRET (mínimo 32 caracteres)');
  return (instance ??= createAuth());
}
export const isDemo = () =>
  process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
