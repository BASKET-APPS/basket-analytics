'use client';
import { useRef, useState } from 'react';
import type { AppState } from '@/domain/basketball/types';

export interface PendingCommand {
  action: string;
  payload: Record<string, unknown>;
  gameId?: string;
  mutationId: string;
  resolve: (ok: boolean) => void;
}

export type CommandExecutor = (
  currentState: AppState,
  command: {
    action: any;
    payload: Record<string, unknown>;
    gameId?: string;
    mutationId: string;
    version: number;
  }
) => Promise<AppState>;

export function useCommandQueue(
  state: AppState | null,
  onState: (state: AppState) => void,
  onError: (message: string) => void,
  onSaved: (action: string, state: AppState) => void,
  executor?: CommandExecutor
) {
  const current = useRef(state);
  current.current = state;
  const queue = useRef<PendingCommand[]>([]);
  const working = useRef(false);
  const [pending, setPending] = useState<PendingCommand[]>([]);
  const [syncError, setSyncError] = useState('');

  const publish = () => setPending([...queue.current]);

  const drain = async () => {
    if (working.current || !current.current) return;
    working.current = true;

    while (queue.current.length) {
      const item = queue.current[0];
      try {
        if (!executor) {
          throw new Error('No hay ejecutor de comandos disponible');
        }

        const updatedState = await executor(current.current, {
          action: item.action,
          payload: item.payload,
          gameId: item.gameId,
          mutationId: item.mutationId,
          version: current.current.version,
        });

        current.current = updatedState;
        onState(updatedState);
        queue.current.shift();
        publish();
        onSaved(item.action, updatedState);
        item.resolve(true);
      } catch (error) {
        const message = (error as Error).message || 'Error al guardar';
        setSyncError(message);
        onError(message);
        working.current = false;
        return;
      }
    }

    working.current = false;
    setSyncError('');
  };

  const enqueue = (
    action: string,
    payload: Record<string, unknown>,
    gameId: string | undefined,
    _url?: string,
    mutationId = crypto.randomUUID()
  ) =>
    new Promise<boolean>((resolve) => {
      queue.current.push({ action, payload, gameId, mutationId, resolve });
      publish();
      if (!syncError) void drain();
    });

  return {
    enqueue,
    pending,
    syncError,
    retry: () => {
      setSyncError('');
      void drain();
    },
    acceptState: (s: AppState) => {
      current.current = s;
      onState(s);
    },
  };
}
