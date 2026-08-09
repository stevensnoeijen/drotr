import { useState } from 'react';

import { ALL_DEBUG_FLAGS, type DebugFlag } from '~/game/testcases';

export interface GameStats {
  /** Rendered frames per second, as reported by the Pixi ticker. */
  fps: number;
  /** Total fixed simulation steps run so far. */
  tick: number;
  /** Number of entities currently in the world. */
  entities: number;
}

export interface DebugOverlayProps {
  stats: GameStats;
  /** Currently enabled debug flags, as resolved from `?debug=`. */
  debugFlags: ReadonlySet<DebugFlag>;
  /** Called when a flag is clicked in the dropdown, to flip it on/off. */
  onToggleDebugFlag: (flag: DebugFlag) => void;
  className?: string;
}

/**
 * A small, non-interactive readout of simulation stats, plus an interactive
 * dropdown of debug flags — drawn on top of the canvas. The tick count
 * advances at the fixed-timestep rate independently of the render FPS; that
 * divergence is the point of the stats readout.
 */
export default function DebugOverlay({
  stats,
  debugFlags,
  onToggleDebugFlag,
  className,
}: DebugOverlayProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`absolute left-2 top-2 flex flex-col items-start gap-2 font-mono text-xs text-green-400 ${className ?? ''}`}
    >
      <dl className="pointer-events-none m-0 grid grid-cols-[auto_auto] gap-x-3 rounded bg-black/60 px-3 py-2">
        <dt>FPS</dt>
        <dd className="text-right tabular-nums">{Math.round(stats.fps)}</dd>
        <dt>Tick</dt>
        <dd className="text-right tabular-nums">{stats.tick}</dd>
        <dt>Entities</dt>
        <dd className="text-right tabular-nums">{stats.entities}</dd>
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
