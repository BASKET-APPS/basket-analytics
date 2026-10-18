import { z } from 'zod';

export const entityId = z.string().min(1);

export const newId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  }
  return Math.random().toString(16).slice(2, 14) + Math.random().toString(16).slice(2, 14);
};

export function objectId(id: string): any {
  return id as any;
}

