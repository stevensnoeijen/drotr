import { describe, expect, it } from 'vitest';

import {
  anchorCellAt,
  entityGap,
  footprintCentre,
  footprintGap,
  footprintOf,
  footprintShift,
  isAtFootprintCentre,
  snapToFootprint,
} from './footprint';

const CELL = 20;
const ONE = { width: 1, height: 1 };
const TWO_BY_TWO = { width: 2, height: 2 };
const ONE_BY_TWO = { width: 1, height: 2 };

describe('footprint geometry', () => {
  it('defaults to a single cell', () => {
    expect(footprintOf({})).toEqual(ONE);
    expect(footprintOf({ footprint: TWO_BY_TWO })).toEqual(TWO_BY_TWO);
  });

  it('centres a 1x1 block on its cell and a 2x2 block on a cell corner', () => {
    expect(footprintCentre(3, 1, ONE, CELL)).toEqual({ x: 70, y: 30 });
    expect(footprintCentre(3, 1, TWO_BY_TWO, CELL)).toEqual({ x: 80, y: 40 });
    expect(footprintShift(ONE, CELL)).toEqual({ x: 0, y: 0 });
    expect(footprintShift(TWO_BY_TWO, CELL)).toEqual({ x: 10, y: 10 });
  });

  it('shifts only the axis with an even side for a non-square footprint', () => {
    // A 1x2 (cannon-shaped) block: no shift along x (odd), half a cell
    // along y (even) — its centre sits on a cell centre horizontally and a
    // shared edge vertically.
    expect(footprintShift(ONE_BY_TWO, CELL)).toEqual({ x: 0, y: 10 });
    expect(footprintCentre(3, 1, ONE_BY_TWO, CELL)).toEqual({ x: 70, y: 40 });
  });

  it('round-trips a block centre back to its anchor cell', () => {
    for (const size of [ONE, TWO_BY_TWO, ONE_BY_TWO]) {
      const centre = footprintCentre(4, 7, size, CELL);
      expect(anchorCellAt(centre.x, centre.y, size, CELL)).toEqual({ x: 4, y: 7 });
    }
  });

  it('snaps a 2x2 block over a whole 40px tile when given the tile centre', () => {
    // Map spawn points sit at tile centres: tile (1, 0) spans cells 2-3.
    expect(snapToFootprint({ x: 60, y: 20 }, TWO_BY_TWO, CELL)).toEqual({ x: 60, y: 20 });
    expect(anchorCellAt(60, 20, TWO_BY_TWO, CELL)).toEqual({ x: 2, y: 0 });
  });

  it('knows when a 2x2 unit is resting on its block centre, not a cell centre', () => {
    expect(isAtFootprintCentre({ x: 60, y: 20 }, TWO_BY_TWO, CELL)).toBe(true);
    expect(isAtFootprintCentre({ x: 50, y: 10 }, TWO_BY_TWO, CELL)).toBe(false);
    expect(isAtFootprintCentre({ x: 50, y: 10 }, ONE, CELL)).toBe(true);
  });

  it('measures the gap between blocks as 8-way steps between their nearest cells', () => {
    const knight = { x: 2, y: 2 }; // cells 2-3 on both axes
    expect(footprintGap(knight, TWO_BY_TWO, { x: 4, y: 2 }, ONE)).toBe(1); // edge
    expect(footprintGap(knight, TWO_BY_TWO, { x: 4, y: 4 }, ONE)).toBe(1); // corner diagonal
    expect(footprintGap(knight, TWO_BY_TWO, { x: 1, y: 1 }, ONE)).toBe(1); // opposite corner
    expect(footprintGap(knight, TWO_BY_TWO, { x: 3, y: 3 }, ONE)).toBe(0); // overlap
    expect(footprintGap(knight, TWO_BY_TWO, { x: 5, y: 2 }, ONE)).toBe(2);
    expect(footprintGap({ x: 0, y: 0 }, ONE, { x: 3, y: 1 }, ONE)).toBe(3);
  });

  it('reduces to the plain 1x1 cell gap (cellSteps) when both blocks are single cells', () => {
    expect(footprintGap({ x: 0, y: 0 }, ONE, { x: 1, y: 0 }, ONE)).toBe(1);
    expect(footprintGap({ x: 0, y: 0 }, ONE, { x: 1, y: 1 }, ONE)).toBe(1);
    expect(footprintGap({ x: 4, y: 4 }, ONE, { x: 4, y: 4 }, ONE)).toBe(0);
    expect(footprintGap({ x: 0, y: 0 }, ONE, { x: 3, y: 7 }, ONE)).toBe(7);
  });

  it('measures the gap between a tall (1x2) footprint and a single cell independently per axis', () => {
    // A 1x2 block anchored at (2, 2) spans rows 2-3, column 2 only. A 1x1
    // cell one column over, on a row within the block's span, touches its
    // edge (gap 1) even though it's outside the block's own row range by
    // nothing (row 3 is the block's own bottom row).
    expect(footprintGap({ x: 2, y: 2 }, ONE_BY_TWO, { x: 3, y: 3 }, ONE)).toBe(1);
    // Two columns over instead: no longer touching.
    expect(footprintGap({ x: 2, y: 2 }, ONE_BY_TWO, { x: 4, y: 3 }, ONE)).toBe(2);
  });

  it('measures the gap between two entities from their positions', () => {
    const knight = {
      footprint: TWO_BY_TWO,
      transform: { position: { x: 60, y: 60 }, rotation: 0 },
    };
    const cornerFoe = { transform: { position: { x: 90, y: 90 }, rotation: 0 } };
    expect(entityGap(knight, cornerFoe, CELL)).toBe(1);
    expect(entityGap(cornerFoe, knight, CELL)).toBe(1);
  });
});
