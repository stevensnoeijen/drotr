import { footprintGap } from '~/game/navigation/footprint';

/** A grid cell, as a (column, row) pair. */
export interface Cell {
  x: number;
  y: number;
}

/** A rectangular footprint's size, in cells. */
export interface CellSize {
  width: number;
  height: number;
}

/** The size every call below defaults to: a single cell. */
const SINGLE_CELL: CellSize = { width: 1, height: 1 };

/**
 * Chebyshev (chessboard) distance, in grid cells: the number of 8-way
 * (horizontal/vertical/diagonal) steps that separate two cells, matching the
 * 8-way movement grid.
 *
 * This — not Euclidean distance — is what `attackRange` is measured in. A
 * target one cell diagonally away is one 8-way step (`attackRange` 1 should
 * reach it), but its Euclidean distance is `sqrt(2)` cell widths, further
 * than a range-1 Euclidean check would allow.
 */
export function cellSteps(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * The cell nearest `from` that a unit could stand in and still reach
 * `target` — i.e. the closest cell whose {@link cellSteps} distance to
 * `target` is at most `range`, that `isAvailable` accepts.
 *
 * This is where an attacker's approach *ends*: `SeekSystem` walks the unit to
 * this cell's centre through the ordinary `MoveTarget`/`MovePath` pipeline
 * instead of stopping it wherever a live Euclidean distance check happens to
 * run out. A unit's resting place has to be
 * a cell centre, and the only way to guarantee that is to pick the cell first
 * and let the movement system land on it.
 *
 * For multi-cell units, `from`, `target` and the result are anchor
 * (top-left) cells of `selfSize`- and `targetSize`-cell rectangles: reach is
 * measured between the nearest cells of the two blocks ({@link footprintGap}),
 * no candidate ever overlaps the target's block, and `isAvailable` answers
 * for the attacker's *whole* block anchored at (col, row), not just that one
 * cell. Both default to a single cell, which is exactly today's behaviour.
 *
 * Nearest is by squared Euclidean distance from `from`, so:
 *
 * - a melee unit (`range` 1) heads for the neighbour of `target` on its own
 *   side of it, rather than walking around to some arbitrary one, and
 * - a ranged unit (`range` 5, the crossbow soldier) stops at the *first* cell
 *   from which it can shoot rather than closing to melee for no reason — and,
 *   since a unit already inside that ring is its own nearest such cell, never
 *   takes a step it doesn't need to.
 *
 * `target`'s own cell is never a candidate: a unit cannot stand where the unit
 * it is fighting stands. Every other cell is offered to `isAvailable`, which
 * is how terrain and — crucially for two units converging on the same gap —
 * other units' claims are kept out of the answer, using the same occupancy
 * grid that already stops click-to-move orders from putting two units in one
 * cell. Ties resolve to the lowest row, then the lowest column, so the choice
 * is deterministic rather than dependent on iteration luck.
 *
 * Returns `undefined` when every cell in reach of `target` is taken or
 * blocked; the caller decides what to do with that (`SeekSystem` holds
 * position and tries again on its next pass).
 *
 * Deliberately no line-of-sight test on the chosen cell: whether a ranged
 * unit needs to *see* what it shoots is a question worth revisiting, not this one's.
 */
export function findAttackCell(
  from: Cell,
  target: Cell,
  range: number,
  isAvailable: (col: number, row: number) => boolean,
  selfSize: CellSize = SINGLE_CELL,
  targetSize: CellSize = SINGLE_CELL
): Cell | undefined {
  let best: Cell | undefined;
  let bestDistance = Infinity;

  // Every anchor whose block could possibly come within `range` of the
  // target's — derived from solving `footprintGap(candidate, selfSize,
  // target, targetSize) <= range` for the candidate's column/row bounds.
  // Reduces to `target.axis - range .. target.axis + range` for 1x1 on 1x1.
  const rowStart = target.y - range - (selfSize.height - 1);
  const rowEnd = target.y + targetSize.height - 1 + range;
  const colStart = target.x - range - (selfSize.width - 1);
  const colEnd = target.x + targetSize.width - 1 + range;

  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      const gap = footprintGap({ x: col, y: row }, selfSize, target, targetSize);
      // Zero is an overlap with the target's own footprint: never a place
      // to stand, whatever `isAvailable` says.
      if (gap === 0 || gap > range) {
        continue;
      }
      if (!isAvailable(col, row)) {
        continue;
      }

      const dx = col - from.x;
      const dy = row - from.y;
      // Squared: only the ordering matters, and a square root per candidate
      // cell is pure cost in a loop that runs per pursuing unit.
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x: col, y: row };
      }
    }
  }

  return best;
}
