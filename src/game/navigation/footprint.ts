import type { Entity } from '~/game/ecs/entity';
import type { Footprint } from '~/game/ecs/components';
import { CELL_CENTRE_TOLERANCE } from '~/lib/grid';
import type { Point } from '~/lib/math/types';

/**
 * Geometry of a unit's rectangular footprint on the unit-placement grid.
 *
 * A footprint is addressed by its **anchor**: the top-left cell of its
 * `width` x `height` block. A unit's world position is always the centre of
 * that block, which is a cell centre when a side is odd and the shared
 * corner (or edge) between cells when it's even — see
 * {@link file://../ecs/components/footprint.ts} for why that, and not
 * centring on a single cell, is the rule. Shifting a position by
 * {@link footprintShift} turns it into the centre of the anchor cell, so
 * every 1x1 world<->cell conversion in this module applies unchanged to a
 * larger block; every one of them reduces to its existing 1x1 counterpart
 * (`toGridPosition`/`toWorldPosition`/`isAtCellCentre` in `~/lib/grid`) when
 * `size` is `{ width: 1, height: 1 }`.
 */

/** A (col, row) pair on the unit-placement grid. */
export interface GridCell {
  x: number;
  y: number;
}

/** Every unit not given an explicit footprint occupies exactly one cell. */
const DEFAULT_FOOTPRINT: Footprint = { width: 1, height: 1 };

/** `entity`'s footprint, in cells: {@link DEFAULT_FOOTPRINT} unless it carries one. */
export function footprintOf(entity: Pick<Entity, 'footprint'>): Footprint {
  return entity.footprint ?? DEFAULT_FOOTPRINT;
}

/**
 * World distance from a `size`-cell block's centre to its anchor (top-left)
 * cell's own centre, on each axis: zero along an odd side (the block centre
 * falls on a cell centre there), half a cell along an even one (it falls on
 * the shared corner/edge between two cells instead).
 */
export function footprintShift(size: Footprint, cellSize: number): Point {
  return {
    x: ((size.width - 1) * cellSize) / 2,
    y: ((size.height - 1) * cellSize) / 2,
  };
}

/** The anchor (top-left) cell of the `size`-cell block whose centre is nearest (`x`, `y`). */
export function anchorCellAt(x: number, y: number, size: Footprint, cellSize: number): GridCell {
  const shift = footprintShift(size, cellSize);
  return {
    x: Math.floor((x - shift.x) / cellSize),
    y: Math.floor((y - shift.y) / cellSize),
  };
}

/** World-space centre of the `size`-cell block anchored (top-left) at (`col`, `row`). */
export function footprintCentre(col: number, row: number, size: Footprint, cellSize: number): Point {
  return { x: (col + size.width / 2) * cellSize, y: (row + size.height / 2) * cellSize };
}

/** Snaps a world position to the centre of the `size`-cell block it falls in. */
export function snapToFootprint(position: Point, size: Footprint, cellSize: number): Point {
  const anchor = anchorCellAt(position.x, position.y, size, cellSize);
  return footprintCentre(anchor.x, anchor.y, size, cellSize);
}

/**
 * Whether a position rests exactly on its `size`-cell block's centre, within
 * `tolerance` — the multi-cell generalisation of `isAtCellCentre` in
 * `~/lib/grid`, and the fact that gates melee combat (`isSettled` in
 * `~/game/systems/combat-system`) for a footprint of any size.
 */
export function isAtFootprintCentre(
  position: Point,
  size: Footprint,
  cellSize: number,
  tolerance: number = CELL_CENTRE_TOLERANCE
): boolean {
  const centre = snapToFootprint(position, size, cellSize);
  return (
    Math.abs(position.x - centre.x) <= tolerance && Math.abs(position.y - centre.y) <= tolerance
  );
}

/**
 * Chebyshev gap, in grid cells, between two axis-aligned rectangular
 * blocks: per axis, zero when the spans overlap, otherwise the gap between
 * their nearer edges; the overall gap is the larger of the two axis gaps,
 * matching 8-way adjacency. Zero means the rectangles overlap or touch;
 * for two 1x1 blocks this is exactly `cellSteps` (`~/game/combat/attack-cell`).
 */
export function footprintGap(
  aAnchor: GridCell,
  aSize: Footprint,
  bAnchor: GridCell,
  bSize: Footprint
): number {
  const gapX = Math.max(
    0,
    bAnchor.x - (aAnchor.x + aSize.width - 1),
    aAnchor.x - (bAnchor.x + bSize.width - 1)
  );
  const gapY = Math.max(
    0,
    bAnchor.y - (aAnchor.y + aSize.height - 1),
    aAnchor.y - (bAnchor.y + bSize.height - 1)
  );
  return Math.max(gapX, gapY);
}

/**
 * {@link footprintGap} between two entities' blocks, from wherever they
 * currently stand. This is the unit `attackRange` is measured in, so a
 * knight's 2x2 block and a 1x1 unit touching it at a corner are 1 apart —
 * in melee range, from both sides — and neither ever picks an attack
 * position that overlaps the other's footprint (see `findAttackCell` in
 * `~/game/combat/attack-cell`).
 */
export function entityGap(
  a: Pick<Entity, 'footprint' | 'transform'>,
  b: Pick<Entity, 'footprint' | 'transform'>,
  cellSize: number
): number {
  const aSize = footprintOf(a);
  const bSize = footprintOf(b);
  const pa = a.transform!.position;
  const pb = b.transform!.position;
  return footprintGap(
    anchorCellAt(pa.x, pa.y, aSize, cellSize),
    aSize,
    anchorCellAt(pb.x, pb.y, bSize, cellSize),
    bSize
  );
}
