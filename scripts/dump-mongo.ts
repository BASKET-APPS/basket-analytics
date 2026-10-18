import { readMongoState } from '../src/server/mongo-repository';
import fs from 'node:fs/promises';

async function main() {
  console.log('Reading Mongo states...');
  const state1 = await readMongoState('650000000000000000000001', '650000000000000000000002');
  const state2 = await readMongoState('650000000000000000000003', '650000000000000000000004');
  console.log('State 1 (CDIR):', state1.team, state1.players.length, 'players,', state1.games.length, 'games');
  console.log('State 2 (Pruebas):', state2.team, state2.players.length, 'players,', state2.games.length, 'games');
  
  await fs.writeFile('scripts/dump-mongo.json', JSON.stringify([state1, state2], null, 2));
  console.log('Successfully wrote scripts/dump-mongo.json');
}

main().catch(console.error);
