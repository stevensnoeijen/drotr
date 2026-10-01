import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';

import { UNIT_TYPES, type UnitType } from '~/game/data/units';
import {
  DIRECTIONS,
  UNIT_ACTIONS,
  animationKey,
  type Direction,
} from '~/game/render/sprites/animation-key';
import {
  parseUnitManifest,
  unitManifestPath,
  unitSpritesheetPath,
  type UnitManifest,
} from '~/game/render/sprites/unit-manifest';

/**
 * Contact sheet for one unit's packed spritesheet (`?case=unit-sprites`):
 * every team × action × direction at one uniform scale, each with a live
 * preview, so alpha, clipping and frame-to-frame jitter can be checked by
 * eye. `&compare=1` adds the matching frames from the old, palette-quantised
 * `unit-spritesheet` underneath, for a side-by-side colour-depth check.
 */

interface SheetFrameJson {
  frame: { x: number; y: number; w: number; h: number };
  spriteSourceSize?: { x: number; y: number; w: number; h: number };
  sourceSize?: { w: number; h: number };
}

interface SheetJson {
  frames: Record<string, SheetFrameJson>;
  animations?: Record<string, string[]>;
  meta: { image: string; size: { w: number; h: number } };
}

/** A sheet plus the URL of its image, resolved relative to the JSON. */
interface LoadedSheet {
  json: SheetJson;
  imageUrl: string;
}

const SCALE = 3;
const TICK_MS = 1000 / 30;
/** Old sheet location, kept only for the side-by-side comparison. */
const OLD_SHEET_PATH = '/assets/unit-spritesheet.json';

const DIRECTION_WORDS: Record<Direction, string> = {
  n: 'north',
  ne: 'northeast',
  e: 'east',
  se: 'southeast',
  s: 'south',
  sw: 'southwest',
  w: 'west',
  nw: 'northwest',
};

/** Prefixes an absolute public path with the app's base URL. */
const publicUrl = (p: string) =>
  `${import.meta.env.BASE_URL}${p.replace(/^\//, '')}`;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function loadSheet(jsonPath: string): Promise<LoadedSheet> {
  const url = publicUrl(jsonPath);
  const json = (await fetchJson(url)) as SheetJson;
  const imageUrl = url.slice(0, url.lastIndexOf('/') + 1) + json.meta.image;
  return { json, imageUrl };
}

/**
 * Frame names per animation in the old sheet, which spelled directions out
 * (`swordsmen.red.move.south_01`) and used one unnumbered frame for idle.
 * Keyed by the new animation key.
 */
function indexOldFrames(sheet: SheetJson): Map<string, string[]> {
  const words = Object.fromEntries(
    Object.entries(DIRECTION_WORDS).map(([d, w]) => [w, d])
  );
  const index = new Map<string, string[]>();
  for (const name of Object.keys(sheet.frames)) {
    const [base] = name.split('_');
    const parts = base.split('.');
    const direction = words[parts[3]];
    if (parts.length !== 4 || !direction) continue;
    const key = [...parts.slice(0, 3), direction].join('.');
    const list = index.get(key) ?? [];
    list.push(name);
    index.set(key, list);
  }
  const frameNumber = (name: string) => Number(name.split('_')[1] ?? 0);
  for (const list of index.values()) {
    list.sort((a, b) => frameNumber(a) - frameNumber(b));
  }
  return index;
}

function Frame({
  sheet,
  name,
  size,
}: {
  sheet: LoadedSheet;
  name: string;
  size: [number, number];
}) {
  const entry = sheet.json.frames[name];
  const box: CSSProperties = {
    width: size[0] * SCALE,
    height: size[1] * SCALE,
  };
  if (!entry) {
    return (
      <div
        style={box}
        className="flex items-center justify-center bg-red-900 text-xs"
        title={`missing ${name}`}
      >
        ?
      </div>
    );
  }
  const { frame } = entry;
  // Trimmed (old) frames sit at their offset inside the untrimmed box.
  const offset = entry.spriteSourceSize ?? { x: 0, y: 0 };
  const { w, h } = sheet.json.meta.size;
  return (
    <div
      style={box}
      title={name}
      data-frame={name}
      className="relative shrink-0 bg-[repeating-conic-gradient(#555_0_25%,#444_0_50%)] bg-size-[12px_12px]"
    >
      <div
        className="absolute [image-rendering:pixelated]"
        style={{
          left: offset.x * SCALE,
          top: offset.y * SCALE,
          width: frame.w * SCALE,
          height: frame.h * SCALE,
          backgroundImage: `url(${sheet.imageUrl})`,
          backgroundPosition: `-${frame.x * SCALE}px -${frame.y * SCALE}px`,
          backgroundSize: `${w * SCALE}px ${h * SCALE}px`,
        }}
      />
    </div>
  );
}

/** The static frames of one animation; memoised so the preview tick skips it. */
const FrameStrip = memo(function FrameStrip({
  sheet,
  names,
  size,
}: {
  sheet: LoadedSheet;
  names: string[];
  size: [number, number];
}) {
  return (
    <div className="flex gap-1">
      {names.map((name) => (
        <Frame key={name} sheet={sheet} name={name} size={size} />
      ))}
    </div>
  );
});

function AnimationRow({
  label,
  sheet,
  names,
  size,
  fps,
  elapsedMs,
}: {
  label: string;
  sheet: LoadedSheet;
  names: string[];
  size: [number, number];
  fps: number;
  elapsedMs: number;
}) {
  const current =
    names.length > 0
      ? names[Math.floor((elapsedMs / 1000) * fps) % names.length]
      : undefined;
  return (
    <div className="flex items-center gap-3" data-animation={label}>
      <span className="w-56 shrink-0 font-mono text-xs text-neutral-300">
        {label}
      </span>
      {current ? (
        <Frame sheet={sheet} name={current} size={size} />
      ) : (
        <div style={{ width: size[0] * SCALE }} />
      )}
      <FrameStrip sheet={sheet} names={names} size={size} />
    </div>
  );
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      sheet: LoadedSheet;
      manifest: UnitManifest;
      old?: LoadedSheet;
    };

function useUnitSprites(unit: UnitType, compare: boolean): LoadState {
  const [state, setState] = useState<{ key: string; state: LoadState }>();
  const key = `${unit}:${compare}`;
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadSheet(unitSpritesheetPath(unit)),
      fetchJson(publicUrl(unitManifestPath(unit))).then(parseUnitManifest),
      compare ? loadSheet(OLD_SHEET_PATH) : Promise.resolve(undefined),
    ])
      .then(([sheet, manifest, old]) => {
        if (!cancelled) {
          setState({ key, state: { status: 'ready', sheet, manifest, old } });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            key,
            state: {
              status: 'error',
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [unit, compare, key]);
  return state?.key === key ? state.state : { status: 'loading' };
}

function useElapsed(playing: boolean): [number, (ms: number) => void] {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setElapsed((t) => t + TICK_MS), TICK_MS);
    return () => clearInterval(id);
  }, [playing]);
  return [elapsed, (ms) => setElapsed((t) => t + ms)];
}

export default function UnitSprites({
  unit: requested,
  compare = false,
}: {
  unit?: string;
  compare?: boolean;
}) {
  const unit: UnitType = (UNIT_TYPES as readonly string[]).includes(
    requested ?? ''
  )
    ? (requested as UnitType)
    : 'swordsmen';
  const state = useUnitSprites(unit, compare);
  const [playing, setPlaying] = useState(true);
  const [elapsed, advance] = useElapsed(playing);
  const oldIndex = useMemo(
    () =>
      state.status === 'ready' && state.old
        ? indexOldFrames(state.old.json)
        : undefined,
    [state]
  );

  return (
    <div className="min-h-screen bg-neutral-900 p-4 text-white">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Link to="/" className="text-sm text-neutral-400 hover:text-white">
          ← Home
        </Link>
        <h1 className="text-lg">Unit sprites: {unit}</h1>
        <button
          className="rounded bg-neutral-700 px-2 py-1 text-sm"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          className="rounded bg-neutral-700 px-2 py-1 text-sm"
          disabled={playing}
          // One frame at the fastest action rate seen in practice.
          onClick={() => advance(1000 / 15)}
        >
          Step
        </button>
      </div>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && (
        <p className="text-red-400">Could not load sprites: {state.message}</p>
      )}
      {state.status === 'ready' && (
        <div className="flex flex-col gap-1">
          {state.manifest.teams.flatMap((team) =>
            UNIT_ACTIONS.filter((a) => state.manifest.actions[a]).flatMap(
              (action) =>
                DIRECTIONS.map((direction) => {
                  const key = animationKey(unit, team, action, direction);
                  const { fps } = state.manifest.actions[action]!;
                  const names = state.sheet.json.animations?.[key] ?? [];
                  return (
                    <div key={key} className="flex flex-col gap-1">
                      <AnimationRow
                        label={key}
                        sheet={state.sheet}
                        names={names}
                        size={state.manifest.frameSize}
                        fps={fps}
                        elapsedMs={elapsed}
                      />
                      {state.old && (
                        <AnimationRow
                          label={`${key} (old)`}
                          sheet={state.old}
                          names={oldIndex?.get(key) ?? []}
                          size={state.manifest.frameSize}
                          fps={fps}
                          elapsedMs={elapsed}
                        />
                      )}
                    </div>
                  );
                })
            )
          )}
        </div>
      )}
    </div>
  );
}
