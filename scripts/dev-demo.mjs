import { spawn } from 'node:child_process';
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3001'],
  { stdio: 'inherit', env: { ...process.env, DEMO_MODE: 'true', DEMO_PORT: '3001' } },
);
child.on('exit', (code) => process.exit(code ?? 1));
