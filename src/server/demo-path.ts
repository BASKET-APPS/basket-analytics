import path from 'node:path';
const root = path.resolve(process.cwd(), '.data');
export const demoDirectory = process.env.DEMO_DATA_DIR
  ? path.resolve(root, process.env.DEMO_DATA_DIR)
  : root;
if (demoDirectory !== root && !demoDirectory.startsWith(root + path.sep))
  throw Error('DEMO_DATA_DIR debe estar dentro de .data');
