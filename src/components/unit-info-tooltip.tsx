import type { SelectedUnitStats } from './debug-overlay';

export interface UnitInfoTooltipProps {
  /** Combat stats of the hovered unit, if any. */
  stats?: SelectedUnitStats;
  /** Current pointer position in screen coordinates. */
  pointerPosition?: { x: number; y: number };
  className?: string;
}

/**
 * A tooltip that follows the cursor and displays combat stats for a hovered unit
 * when the unit-info debug flag is enabled. Shows only when hovering a unit.
 */
export default function UnitInfoTooltip({
  stats,
  pointerPosition,
  className,
}: UnitInfoTooltipProps) {
  if (!stats || !pointerPosition) {
    return null;
  }

  return (
    <div
      className={`pointer-events-none fixed font-mono text-xs text-green-400 ${className ?? ''}`}
      style={{
        left: `${pointerPosition.x + 12}px`,
        top: `${pointerPosition.y + 12}px`,
      }}
    >
      <dl className="m-0 grid grid-cols-[auto_auto] gap-x-3 rounded bg-black/80 px-2 py-1">
        {stats.id !== undefined && (
          <>
            <dt>ID</dt>
            <dd className="text-right tabular-nums">{stats.id}</dd>
          </>
        )}
        {stats.type && (
          <>
            <dt>Type</dt>
            <dd className="text-right">{stats.type}</dd>
          </>
        )}
        {stats.team && (
          <>
            <dt>Team</dt>
            <dd className="text-right">{stats.team}</dd>
          </>
        )}
        <dt>Damage</dt>
        <dd className="text-right tabular-nums">{stats.damage ?? '-'}</dd>
        <dt>Accuracy</dt>
        <dd className="text-right tabular-nums">{stats.accuracy ?? '-'}</dd>
        <dt>Defence</dt>
        <dd className="text-right tabular-nums">{stats.defence ?? '-'}</dd>
        <dt>Stamina</dt>
        <dd className="text-right tabular-nums">{stats.stamina ?? '-'}</dd>
        <dt>Speed</dt>
        <dd className="text-right tabular-nums">{stats.speed ?? '-'}</dd>
        <dt>Range</dt>
        <dd className="text-right tabular-nums">{stats.range ?? '-'}</dd>
      </dl>
    </div>
  );
}
