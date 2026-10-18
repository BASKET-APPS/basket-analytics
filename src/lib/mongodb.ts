import 'server-only';
import { MongoClient } from 'mongodb';

const cache = globalThis as typeof globalThis & {
  basketMongo?: { uri: string; promise: Promise<MongoClient> };
};
export async function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI no configurada');
  if (!cache.basketMongo || cache.basketMongo.uri !== uri) {
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 6000,
      connectTimeoutMS: 6000,
    });
    const promise = client.connect();
    cache.basketMongo = { uri, promise };
    promise.catch(() => {
      if (cache.basketMongo?.promise === promise) cache.basketMongo = undefined;
    });
  }
  return cache.basketMongo.promise;
}
export async function getDb() {
  return (await getMongoClient()).db(process.env.MONGODB_DB || 'basketball_stats');
}
