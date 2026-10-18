import { spawn } from 'node:child_process';
for (const file of ['.env', '.env.local'])
  try {
    process.loadEnvFile(file);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
if (!process.env.MONGODB_URI) {
  console.error('Configura MONGODB_URI en .env.local antes de iniciar Atlas.');
  process.exit(1);
}
const env = { ...process.env, DEMO_MODE: 'false', LOCAL_MONGO_MODE: 'true' };
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3001'],
  { env, stdio: 'inherit' },
);
child.on('exit', (code) => process.exit(code ?? 1));
