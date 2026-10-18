'use client';
import { useState } from 'react';
import type { Player } from '@/domain/basketball/types';

export default function PlayerPortrait({ player }: { player: Player }) {
  const [failed, setFailed] = useState('');
  return (
    <span className="player-portrait" aria-hidden="true">
      {player.photo && failed !== player.photo ? (
        <img draggable={false} src={player.photo} alt="" onError={() => setFailed(player.photo!)} />
      ) : (
        <span className="portrait-placeholder">
          {player.name
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((n) => n[0])
            .join('')
            .toLocaleUpperCase('es')}
        </span>
      )}
      <b className="portrait-number">{player.number}</b>
    </span>
  );
}
