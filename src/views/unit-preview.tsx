import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  AnimatedSprite,
  Application,
  Assets,
  Container,
  Graphics,
  type Spritesheet,
} from 'pixi.js';

import type { UnitType } from '~/game/data/units';
import { animationKey } from '~/game/render/sprites/animation-key';
import {
  UNIT_ATLAS_PATH,
  parseUnitManifest,
  unitManifestPath,
  type UnitManifest,
} from '~/game/render/sprites/unit-manifest';

import {
  animationOptions,
  animationSpeed,
  atlasUnits,
  resolveSelection,
  selectionFromParams,
  type AnimationSelection,
} from './unit-preview-options';

/**
 * Unit preview page (`#/unit-preview`): plays one animation of
 * the shared unit atlas through Pixi, at the manifest's fps and anchor, so
 * it looks the way it will in the game. The frame bounds and anchor are
 * drawn on top so any frame-to-frame jitter stands out. Units are found
 * from the atlas itself, so a newly packed unit appears here on its own.
 */

/** Canvas size and zoom: a 32 px frame fills about two thirds of the canvas. */
const CANVAS_SIZE = 384;
const ZOOM = 8;

const publicUrl = (p: string) =>
  `${import.meta.env.BASE_URL}${p.replace(/^\//, '')}`;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      sheet: Spritesheet;
      units: UnitType[];
      manifests: Partial<Record<UnitType, UnitManifest>>;
    };

function useUnitAtlas(): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sheet = await Assets.load<Spritesheet>(publicUrl(UNIT_ATLAS_PATH));
      sheet.textureSource.scaleMode = 'nearest';
      const units = atlasUnits(Object.keys(sheet.data.animations ?? {}));
      const entries = await Promise.all(
        units.map(async (unit) => {
          const response = await fetch(publicUrl(unitManifestPath(unit)));
          if (!response.ok) {
            throw new Error(`${unit} manifest: ${response.status}`);
          }
          return [unit, parseUnitManifest(await response.json())] as const;
        })
      );
      return { sheet, units, manifests: Object.fromEntries(entries) };
    })()
      .then((loaded) => {
        if (!cancelled) setState({ status: 'ready', ...loaded });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

/** Mounts a Pixi application into the returned ref; `stage` is set once ready. */
function usePixiStage(enabled: boolean) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Container>();
  useEffect(() => {
    const host = hostRef.current;
    if (!enabled || !host) return;
    let cancelled = false;
    let app: Application | undefined;
    (async () => {
      const instance = new Application();
      await instance.init({
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        background: '#3a3a3a',
        antialias: false,
        preference: 'webgl',
      });
      if (cancelled) {
        // The atlas textures belong to the Assets cache, not this view.
        instance.destroy(true, { children: true });
        return;
      }
      app = instance;
      host.appendChild(app.canvas);
      setStage(app.stage);
    })();
    return () => {
      cancelled = true;
      app?.destroy(true, { children: true });
      setStage(undefined);
    };
  }, [enabled]);
  return { hostRef, stage };
}

interface Playback {
  frame: number;
  playing: boolean;
}

/**
 * The selection can be preset with `?unit=&team=&action=&direction=&loop=`;
 * it's read on mount and whenever the query changes.
 */
export default function UnitPreview() {
  const [searchParams] = useSearchParams();
  const state = useUnitAtlas();
  const [requested, setRequested] = useState<Partial<AnimationSelection>>(() =>
    selectionFromParams(searchParams)
  );
  // The page stays mounted when only the query changes (e.g. following
  // another preset link), so re-read it then, while rendering.
  const query = searchParams.toString();
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) {
    setPrevQuery(query);
    setRequested(selectionFromParams(searchParams));
  }
  const ready = state.status === 'ready' ? state : undefined;
  const selection = ready
    ? resolveSelection(ready.units, ready.manifests, requested)
    : undefined;
  const manifest = selection && ready?.manifests[selection.unit];
  const key =
    selection &&
    animationKey(
      selection.unit,
      selection.team,
      selection.action,
      selection.direction
    );
  const frameNames = (key && ready?.sheet.data.animations?.[key]) || [];

  const { hostRef, stage } = usePixiStage(ready !== undefined);
  const spriteRef = useRef<AnimatedSprite>(undefined);
  const [playback, setPlayback] = useState<Playback>({
    frame: 0,
    playing: false,
  });

  // A new animation (or loop setting) starts from frame 0, playing unless
  // it is a single frame or has no fps. Reset while rendering rather than
  // in the effect that builds the sprite.
  const fps = selection && manifest?.actions[selection.action]?.fps;
  const playbackKey = `${key}:${selection?.loop}`;
  const [prevPlaybackKey, setPrevPlaybackKey] = useState<string>();
  if (prevPlaybackKey !== playbackKey) {
    setPrevPlaybackKey(playbackKey);
    setPlayback({ frame: 0, playing: frameNames.length > 1 && !!fps });
  }

  useEffect(() => {
    if (!stage || !ready || !selection || !manifest || !key) return;
    const textures = ready.sheet.animations[key];
    if (!textures) return;
    const [w, h] = manifest.frameSize;
    const [ax, ay] = manifest.anchor;
    const { fps } = manifest.actions[selection.action]!;

    const view = new Container();
    view.position.set(CANVAS_SIZE / 2, CANVAS_SIZE / 2);
    view.scale.set(ZOOM);

    const sprite = new AnimatedSprite({ textures, autoPlay: false });
    sprite.anchor.set(ax, ay);
    sprite.animationSpeed = animationSpeed(fps);
    sprite.loop = selection.loop;
    sprite.onFrameChange = (frame) => setPlayback((p) => ({ ...p, frame }));
    sprite.onComplete = () => setPlayback((p) => ({ ...p, playing: false }));
    view.addChild(sprite);

    // Frame bounds and anchor, in frame pixels; 1/ZOOM keeps lines 1 px wide.
    const overlay = new Graphics()
      .rect(-ax * w, -ay * h, w, h)
      .stroke({ width: 1 / ZOOM, color: 0xff00ff })
      .moveTo(-2, 0)
      .lineTo(2, 0)
      .moveTo(0, -2)
      .lineTo(0, 2)
      .stroke({ width: 1 / ZOOM, color: 0x00ffff });
    view.addChild(overlay);
    stage.addChild(view);

    spriteRef.current = sprite;
    sprite.gotoAndStop(0);
    if (textures.length > 1 && fps > 0) sprite.play();

    return () => {
      spriteRef.current = undefined;
      view.destroy({ children: true });
    };
    // `selection` is rebuilt every render; its fields are the real inputs.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, ready, manifest, key, selection?.loop]);

  const update = (change: Partial<AnimationSelection>) =>
    setRequested((r) => ({ ...r, ...selection, ...change }));

  const togglePlay = () => {
    const sprite = spriteRef.current;
    if (!sprite) return;
    if (sprite.playing) {
      sprite.stop();
      setPlayback((p) => ({ ...p, playing: false }));
    } else {
      // A finished one-shot restarts from the beginning.
      if (!sprite.loop && sprite.currentFrame === sprite.totalFrames - 1) {
        sprite.gotoAndStop(0);
      }
      sprite.play();
      setPlayback((p) => ({ ...p, playing: true }));
    }
  };

  const step = (delta: number) => {
    const sprite = spriteRef.current;
    if (!sprite) return;
    const n = sprite.totalFrames;
    sprite.gotoAndStop((sprite.currentFrame + delta + n) % n);
    setPlayback({ frame: sprite.currentFrame, playing: false });
  };

  const options = manifest && animationOptions(manifest);
  const select = 'rounded bg-neutral-800 px-2 py-1 text-sm';
  const button = 'rounded bg-neutral-700 px-2 py-1 text-sm disabled:opacity-40';

  return (
    <div className="min-h-screen bg-neutral-900 p-4 text-white">
      <div className="mb-4 flex items-center gap-4">
        <Link to="/" className="text-sm text-neutral-400 hover:text-white">
          ← Home
        </Link>
        <h1 className="text-lg">Unit preview</h1>
      </div>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && (
        <p className="text-red-400">Could not load sprites: {state.message}</p>
      )}
      {ready && ready.units.length === 0 && (
        <p>The unit atlas has no animations yet.</p>
      )}
      {selection && options && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select
            aria-label="Unit"
            className={select}
            value={selection.unit}
            onChange={(e) => update({ unit: e.target.value as UnitType })}
          >
            {ready!.units.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <select
            aria-label="Team"
            className={select}
            value={selection.team}
            onChange={(e) =>
              update({ team: e.target.value as AnimationSelection['team'] })
            }
          >
            {options.teams.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            aria-label="Action"
            className={select}
            value={selection.action}
            onChange={(e) => {
              const action = e.target.value as AnimationSelection['action'];
              // Switching action resets loop to that action's default.
              setRequested({ ...selection, action, loop: undefined });
            }}
          >
            {options.actions.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select
            aria-label="Direction"
            className={select}
            value={selection.direction}
            onChange={(e) =>
              update({
                direction: e.target.value as AnimationSelection['direction'],
              })
            }
          >
            {options.directions.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={selection.loop}
              onChange={(e) => update({ loop: e.target.checked })}
            />
            Loop
          </label>
          <button className={button} onClick={() => step(-1)}>
            ◀ Step
          </button>
          <button className={button} onClick={togglePlay}>
            {playback.playing ? 'Pause' : 'Play'}
          </button>
          <button className={button} onClick={() => step(1)}>
            Step ▶
          </button>
        </div>
      )}
      <div ref={hostRef} className="inline-block [image-rendering:pixelated]" />
      {selection && manifest && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 font-mono text-sm">
          <dt className="text-neutral-400">frame</dt>
          <dd data-testid="frame-index">
            {playback.frame + 1} / {frameNames.length}
          </dd>
          <dt className="text-neutral-400">name</dt>
          <dd data-testid="frame-name">{frameNames[playback.frame] ?? '—'}</dd>
          <dt className="text-neutral-400">fps / anchor</dt>
          <dd>
            {manifest.actions[selection.action]!.fps} /{' '}
            {manifest.anchor.join(', ')}
          </dd>
        </dl>
      )}
    </div>
  );
}
