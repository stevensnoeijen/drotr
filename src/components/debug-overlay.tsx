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
  className?: string;
}

/**
 * A small, non-interactive readout of simulation stats, drawn on top of the
 * canvas. The tick count advances at the fixed-timestep rate independently of
 * the render FPS — that divergence is the point of the overlay.
 */
export default function DebugOverlay({ stats, className }: DebugOverlayProps) {
  return (
    <dl
      className={`pointer-events-none absolute left-2 top-2 m-0 grid grid-cols-[auto_auto] gap-x-3 rounded bg-black/60 px-3 py-2 font-mono text-xs text-green-400 ${className ?? ''}`}
    >
      <dt>FPS</dt>
      <dd className="text-right tabular-nums">{Math.round(stats.fps)}</dd>
      <dt>Tick</dt>
      <dd className="text-right tabular-nums">{stats.tick}</dd>
      <dt>Entities</dt>
      <dd className="text-right tabular-nums">{stats.entities}</dd>
    </dl>
  );
}
