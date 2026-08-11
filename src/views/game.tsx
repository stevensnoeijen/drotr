import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import GameCanvas from '~/components/game-canvas';
import DebugOverlay, { type GameStats } from '~/components/debug-overlay';
import {
  type DebugFlag,
  parseDebugFlags,
  resolveScenario,
  serializeDebugFlags,
} from '~/game/scenarios';

const EMPTY_STATS: GameStats = { fps: 0, tick: 0, entities: 0 };

export default function Game() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const resolved = resolveScenario(searchParams);
  const debugFlags = parseDebugFlags(searchParams.get('debug'));

  // Flips one flag and writes the result back into `?debug=`, so a refresh
  // (or a shared link) restores exactly the overlays that were on. Goes
  // through navigate() with a hand-built query string rather than
  // setSearchParams: the latter always serializes via URLSearchParams,
  // which percent-encodes commas (%2C) even though they're legal unescaped
  // in a query string.
  function handleToggleDebugFlag(flag: DebugFlag) {
    const next = new Set(debugFlags);
    if (next.has(flag)) {
      next.delete(flag);
    } else {
      next.add(flag);
    }

    const params = new URLSearchParams(searchParams);
    const serialized = serializeDebugFlags(next);
    if (serialized) {
      params.set('debug', serialized);
    } else {
      params.delete('debug');
    }

    navigate(`?${params.toString().replaceAll('%2C', ',')}`, {
      replace: true,
    });
  }

  // The canvas pushes fresh stats every frame into a ref; a slow interval
  // copies them into state so the overlay re-renders a few times a second
  // instead of on every frame.
  const statsRef = useRef<GameStats>(EMPTY_STATS);
  const [stats, setStats] = useState<GameStats>(EMPTY_STATS);

  useEffect(() => {
    const id = setInterval(() => setStats({ ...statsRef.current }), 250);
    return () => clearInterval(id);
  }, []);

  if (resolved.error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-neutral-900 px-6 text-center">
        <h1 className="text-2xl font-bold text-white">
          {resolved.requestedId
            ? `Unknown scenario "${resolved.requestedId}"`
            : 'No scenario selected'}
        </h1>
        <p className="text-neutral-300">
          Valid ids:{' '}
          {resolved.validIds.map((id, i) => (
            <span key={id} className="font-mono text-neutral-100">
              {id}
              {i < resolved.validIds.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
        <Link
          to="/"
          className="rounded bg-neutral-700 px-4 py-2 text-white hover:bg-neutral-600"
        >
          Back to scenarios
        </Link>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen">
      <GameCanvas
        // Remounts the canvas (and re-seeds the world) whenever the scenario
        // changes, rather than trying to diff and re-sync a live Pixi scene
        // against a new one. Debug flags are handled reactively inside
        // GameCanvas instead, so toggling one doesn't reset the simulation.
        key={`${resolved.scenario.id}:${resolved.map}`}
        className="absolute inset-0"
        scenario={resolved.scenario}
        debugFlags={debugFlags}
        onStats={(next) => {
          statsRef.current = next;
        }}
      />
      <DebugOverlay
        stats={stats}
        debugFlags={debugFlags}
        onToggleDebugFlag={handleToggleDebugFlag}
      />
    </div>
  );
}
