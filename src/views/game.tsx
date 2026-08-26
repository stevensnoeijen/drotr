import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import GameCanvas, { type ViewportTransform } from '~/components/game-canvas';
import DebugOverlay, { type GameStats } from '~/components/debug-overlay';
import UnitInfoTooltip from '~/components/unit-info-tooltip';
import { resolveMap } from '~/game/maps';
import {
  type DebugFlag,
  parseDebugFlags,
  resolveScenario,
  serializeDebugFlags,
} from '~/game/scenarios';

const EMPTY_STATS: GameStats = { fps: 0, tick: 0, entities: 0 };

/** Delay after the last pan/zoom before `?camera=` is written to the URL. */
const VIEWPORT_SAVE_DEBOUNCE_MS = 250;

/** `?camera=` holds `x,y,z` as one comma-joined value, e.g. `camera=12.5,-4,1.5`. */
const CAMERA_PARAM = 'camera';

/** Parses `?camera=x,y,z` into a camera transform, or undefined if missing/invalid. */
function parseViewport(searchParams: URLSearchParams): ViewportTransform | undefined {
  const raw = searchParams.get(CAMERA_PARAM);
  if (!raw) {
    return undefined;
  }
  const [x, y, scale] = raw.split(',').map(Number);
  if (![x, y, scale].every(Number.isFinite) || scale <= 0) {
    return undefined;
  }
  return { x, y, scale };
}

/** Serializes a camera transform back into `?camera=`'s comma-joined form. */
function serializeViewport({ x, y, scale }: ViewportTransform): string {
  return `${x.toFixed(1)},${y.toFixed(1)},${scale.toFixed(3)}`;
}

export default function Game() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const resolvedScenario = resolveScenario(searchParams);
  const resolvedMap = resolveMap(searchParams);
  const debugFlags = parseDebugFlags(searchParams.get('debug'));
  // Lazy initializer: read once on mount. The camera is thereafter saved via
  // handleViewportChange below, which re-navigates on every save, so
  // re-reading this on every render would just reapply the same initial
  // value — or fight the live camera once panning starts.
  const [initialViewport] = useState(() => parseViewport(searchParams));

  // `searchParams` as of the most recent render, read inside the debounced
  // handleViewportChange callback below (which can fire well after the
  // render that scheduled it) so a save never clobbers a `?debug=` toggle —
  // or vice versa — that happened in between.
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  });

  // Flips one flag and writes the result back into `?debug=`, so a refresh
  // (or a shared link) restores exactly the overlays that were on. Goes
  // through navigate() with a hand-built query string rather than
  // setSearchParams: the latter always serializes via URLSearchParams,
  // which percent-encodes commas (%2C) even though they're legal unescaped
  // in a query string. navigate() (not history.replaceState) because this
  // app is a HashRouter — `map`/`scenario`/`debug`/`camera` all live inside
  // `location.hash`, and only react-router's own navigation knows how to
  // update that rather than the page's real (and here, unused) search string.
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

  // Debounced so a drag or wheel gesture — which can fire many 'moved'
  // events per second — doesn't spam navigate(); only the camera's resting
  // position ends up saved.
  const viewportSaveTimeoutRef = useRef<number | undefined>(undefined);

  function handleViewportChange(transform: ViewportTransform) {
    window.clearTimeout(viewportSaveTimeoutRef.current);
    viewportSaveTimeoutRef.current = window.setTimeout(() => {
      const params = new URLSearchParams(searchParamsRef.current);
      params.set(CAMERA_PARAM, serializeViewport(transform));
      navigate(`?${params.toString().replaceAll('%2C', ',')}`, {
        replace: true,
      });
    }, VIEWPORT_SAVE_DEBOUNCE_MS);
  }

  useEffect(() => {
    return () => window.clearTimeout(viewportSaveTimeoutRef.current);
  }, []);

  // The canvas pushes fresh stats every frame into a ref; a slow interval
  // copies them into state so the overlay re-renders a few times a second
  // instead of on every frame.
  const statsRef = useRef<GameStats>(EMPTY_STATS);
  const [stats, setStats] = useState<GameStats>(EMPTY_STATS);

  useEffect(() => {
    const id = setInterval(() => setStats({ ...statsRef.current }), 250);
    return () => clearInterval(id);
  }, []);

  if (resolvedScenario.error || resolvedMap.error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-neutral-900 px-6 text-center">
        <h1 className="text-2xl font-bold text-white">Can't load this game</h1>
        {resolvedScenario.error && (
          <p className="text-neutral-300">
            {resolvedScenario.requestedId
              ? `Unknown scenario "${resolvedScenario.requestedId}"`
              : 'No scenario selected'}
            . Valid ids:{' '}
            {resolvedScenario.validIds.map((id, i) => (
              <span key={id} className="font-mono text-neutral-100">
                {id}
                {i < resolvedScenario.validIds.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        )}
        {resolvedMap.error && (
          <p className="text-neutral-300">
            {resolvedMap.requestedId
              ? `Unknown map "${resolvedMap.requestedId}"`
              : 'No map selected'}
            . Valid ids:{' '}
            {resolvedMap.validIds.map((id, i) => (
              <span key={id} className="font-mono text-neutral-100">
                {id}
                {i < resolvedMap.validIds.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        )}
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
        // or map changes, rather than trying to diff and re-sync a live Pixi
        // scene against a new one. Debug flags are handled reactively inside
        // GameCanvas instead, so toggling one doesn't reset the simulation.
        key={`${resolvedScenario.scenario.id}:${resolvedMap.map.id}`}
        className="absolute inset-0"
        scenario={resolvedScenario.scenario}
        map={resolvedMap.map}
        initialViewport={initialViewport}
        debugFlags={debugFlags}
        onStats={(next) => {
          statsRef.current = next;
        }}
        onViewportChange={handleViewportChange}
      />
      <DebugOverlay
        stats={stats}
        debugFlags={debugFlags}
        onToggleDebugFlag={handleToggleDebugFlag}
      />
      {debugFlags.has('unit-info') && (
        <UnitInfoTooltip
          stats={stats.hoveredUnitStats}
          pointerPosition={stats.pointerPosition}
        />
      )}
    </div>
  );
}
