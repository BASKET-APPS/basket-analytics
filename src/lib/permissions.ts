import type { Role } from '@/domain/basketball/types';
export function canWrite(role: Role, action: string) {
  return (
    role === 'ADMIN' ||
    (role === 'COACH' && !['team', 'membership'].includes(action)) ||
    (role === 'SCORER' &&
      ['event', 'undo', 'lineup', 'clock', 'start', 'period', 'prepare', 'practice'].includes(
        action,
      ))
  );
}
