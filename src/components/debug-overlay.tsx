import { useState } from 'react';

import type { TileLayerInfo } from '~/game/map/tile-layer-visibility';
import { ALL_DEBUG_FLAGS, type DebugFlag } from '~/game/scenarios';
import { usePageZoomCounterScale } from '~/lib/use-page-zoom-scale';

export interface SelectedUnitStats {
  id?: number;
  type?: string;
  team?: string;
  color?: number;
  /** Whether the hovered unit has died (the `dead` component), vs. still alive. */
  status?: 'alive' | 'dead';
  damage?: number;
  /** Seconds between attacks, gating how often `damage` is applied. */
  attackCooldown?: number;
  accuracy?: number;
  defence?: number;
  stamina?: number;
  speed?: number;
  range?: number;
  /** The unit's current perception target, if any. */
  target?: { id?: number; type?: string };
  /** Grid cell the unit currently stands in, if it has claimed one. */
  cell?: { x: number; y: number };
  /**
   * Grid cell the unit is walking into, if it's currently straddling
   * two cells. Absent when the unit is at rest in {@link cell}.
   */
  movingTo?: { x: number; y: number };
}

export interface GameStats {
  /** Rendered frames per second, as reported by the Pixi ticker. */
  fps: number;
  /** Total fixed simulation steps run so far. */
  tick: number;
  /** Number of entities currently in the world. */
  entities: number;
  /**
   * Grid cell under the pointer, or `undefined` when the pointer is off the
   * map (outside the canvas, or over the canvas but past the map's bounds).
   */
  hoveredCell?: { x: number; y: number };
  /** Combat stats of the unit under the pointer, if any and unit-info debug flag is on. */
  hoveredUnitStats?: SelectedUnitStats;
  /** Current pointer position in screen coordinates, for tooltip positioning. */
  pointerPosition?: { x: number; y: number };
}

export interface DebugOverlayProps {
  stats: GameStats;
  /** Currently enabled debug flags, as resolved from `?debug=`. */
  debugFlags: ReadonlySet<DebugFlag>;
  /** Called when a flag is clicked in the dropdown, to flip it on/off. */
  onToggleDebugFlag: (flag: DebugFlag) => void;
  /**
   * The current map's tile layers, back to front, listed under the
   * `tile-layers` flag while it's on.
   */
  tileLayers?: readonly TileLayerInfo[];
  /** Whether each of {@link tileLayers} is currently shown, by index. */
  tileLayerVisibility?: readonly boolean[];
  /** Called when a tile layer is clicked, with its index, to show/hide it. */
  onToggleTileLayer?: (index: number) => void;
  className?: string;
}

/**
 * A small, non-interactive readout of simulation stats, plus an interactive
 * dropdown of debug flags — drawn on top of the canvas. The tick count
 * advances at the fixed-timestep rate independently of the render FPS; that
 * divergence is the point of the stats readout.
 *
 * Counter-scaled via {@link usePageZoomCounterScale} against the browser's
 * own page zoom (Ctrl+scroll/pinch), so it stays a fixed physical size —
 * unrelated to the game's own camera zoom, which is a Pixi viewport
 * transform on the canvas and never touches this DOM overlay at all.
 */
export default function DebugOverlay({
  stats,
  debugFlags,
  onToggleDebugFlag,
  tileLayers = [],
  tileLayerVisibility = [],
  onToggleTileLayer,
  className,
}: DebugOverlayProps) {
  const [open, setOpen] = useState(false);
  const counterScale = usePageZoomCounterScale();

  return (
    <div
      className={`absolute left-2 top-2 flex flex-col items-start gap-2 font-mono text-xs text-green-400 ${className ?? ''}`}
      style={{ transform: `scale(${counterScale})`, transformOrigin: 'top left' }}
    >
      <dl className="pointer-events-none m-0 grid grid-cols-[auto_auto] gap-x-3 rounded bg-black/60 px-3 py-2">
        <dt>FPS</dt>
        <dd className="text-right tabular-nums">{Math.round(stats.fps)}</dd>
        <dt>Tick</dt>
        <dd className="text-right tabular-nums">{stats.tick}</dd>
        <dt>Entities</dt>
        <dd className="text-right tabular-nums">{stats.entities}</dd>
        <dt>Cell</dt>
        <dd className="text-right tabular-nums">
          {stats.hoveredCell ? `${stats.hoveredCell.x}, ${stats.hoveredCell.y}` : '-'}
        </dd>
      </dl>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="rounded bg-black/60 px-3 py-1 text-left hover:bg-black/80"
        >
          Debug{debugFlags.size > 0 ? ` (${debugFlags.size})` : ''}
        </button>

        {open && (
          <ul className="absolute left-0 top-full mt-1 min-w-max list-none rounded bg-black/80 p-1">
            {ALL_DEBUG_FLAGS.map((flag) => (
              <li key={flag}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-white/10">
                  <input
                    type="checkbox"
                    checked={debugFlags.has(flag)}
                    onChange={() => onToggleDebugFlag(flag)}
                  />
                  {flag}
                </label>
                {flag === 'tile-layers' && debugFlags.has(flag) && (
                  <ul aria-label="Tile layers" className="ml-5 list-none border-l border-green-400/30 pl-1">
                    {tileLayers.length === 0 && (
                      <li className="px-2 py-1 text-green-400/60">no tile layers</li>
                    )}
                    {tileLayers.map((layer, index) => (
                      <li key={index}>
                        <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-white/10">
                          <input
                            type="checkbox"
                            checked={tileLayerVisibility[index] ?? layer.visible}
                            onChange={() => onToggleTileLayer?.(index)}
                          />
                          {layer.name}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
