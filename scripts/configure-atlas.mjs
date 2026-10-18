import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdout.write('Ready for MongoDB URI on stdin (input hidden).\n');
let input = '';
process.stdin.on('data', async (chunk) => {
  input += chunk;
  if (input.length > 10000) process.exit(1);
  if (!/[\r\n]/.test(input)) return;
  process.stdin.pause();
  const uri = input.trim();
  input = '';
  if (!uri.startsWith('mongodb+srv://') && !uri.startsWith('mongodb://')) {
    process.stderr.write('URI no válida.\n');
    process.exit(1);
  }
  let env = '';
  try {
    env = await readFile('.env.local', 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const values = {
    MONGODB_URI: uri,
    MONGODB_DB: 'basketball_stats',
    DEMO_MODE: 'false',
    LOCAL_MONGO_MODE: 'true',
    LOCAL_TEAM_ID: '650000000000000000000003',
  };
  if (!/^BETTER_AUTH_SECRET=.+$/m.test(env))
    values.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
  for (const [key, value] of Object.entries(values)) {
    const line = key + '=' + JSON.stringify(value);
    const pattern = new RegExp('^' + key + '=.*$', 'm');
    env = pattern.test(env) ? env.replace(pattern, () => line) : env.trimEnd() + '\n' + line + '\n';
  }
  await writeFile('.env.local', env.trimStart(), { mode: 0o600 });
  process.stdout.write('Configuración guardada en .env.local; valores confidenciales ocultos.\n');
  process.exit(0);
});
