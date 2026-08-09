import { useEffect, useRef, useState } from 'react';

import GameCanvas from '~/components/game-canvas';
import DebugOverlay, { type GameStats } from '~/components/debug-overlay';

const EMPTY_STATS: GameStats = { fps: 0, tick: 0, entities: 0 };

export default function Game() {
  // The canvas pushes fresh stats every frame into a ref; a slow interval
  // copies them into state so the overlay re-renders a few times a second
  // instead of on every frame.
  const statsRef = useRef<GameStats>(EMPTY_STATS);
  const [stats, setStats] = useState<GameStats>(EMPTY_STATS);

  useEffect(() => {
    const id = setInterval(() => setStats({ ...statsRef.current }), 250);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative h-screen w-screen">
      <GameCanvas
        className="absolute inset-0"
        onStats={(next) => {
          statsRef.current = next;
        }}
      />
      <DebugOverlay stats={stats} />
    </div>
  );
}
