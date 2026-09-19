import { describe, expect, it } from 'vitest';

import { cellSteps, findAttackCell } from './attack-cell';

const anywhere = () => true;

describe('cellSteps', () => {
  it('counts a diagonal neighbour as one step, same as an orthogonal one', () => {
    expect(cellSteps({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(1);
    expect(cellSteps({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(1);
  });

  it('is the larger of the two axis distances', () => {
    expect(cellSteps({ x: 0, y: 0 }, { x: 3, y: 7 })).toBe(7);
    expect(cellSteps({ x: 8, y: 2 }, { x: 1, y: 0 })).toBe(7);
  });

  it('is zero for the same cell', () => {
    expect(cellSteps({ x: 4, y: 4 }, { x: 4, y: 4 })).toBe(0);
  });
});

describe('findAttackCell', () => {
  it('picks the neighbour of the target on the approaching unit’s own side', () => {
    const cell = findAttackCell({ x: 0, y: 5 }, { x: 5, y: 5 }, 1, anywhere);

    expect(cell).toEqual({ x: 4, y: 5 });
  });

  it('picks a diagonal neighbour when the unit approaches diagonally', () => {
    const cell = findAttackCell({ x: 0, y: 0 }, { x: 5, y: 5 }, 1, anywhere);

    expect(cell).toEqual({ x: 4, y: 4 });
  });

  it('never picks the target’s own cell', () => {
    // From the target's own cell every candidate is equidistant-ish; the one
    // thing that must not come back is the cell the target is standing in.
    const cell = findAttackCell({ x: 5, y: 5 }, { x: 5, y: 5 }, 1, anywhere);

    expect(cell).not.toEqual({ x: 5, y: 5 });
  });

  it('stops a ranged unit at the edge of its range instead of closing to melee', () => {
    const cell = findAttackCell({ x: 0, y: 5 }, { x: 10, y: 5 }, 5, anywhere);

    expect(cell).toEqual({ x: 5, y: 5 });
    expect(cellSteps(cell!, { x: 10, y: 5 })).toBe(5);
  });

  it('leaves a ranged unit already in range exactly where it stands', () => {
    const from = { x: 6, y: 5 };

    const cell = findAttackCell(from, { x: 10, y: 5 }, 5, anywhere);

    expect(cell).toEqual(from);
  });

  it('skips cells the availability test refuses', () => {
    // The whole column immediately west of the target is unavailable, so the
    // nearest usable cell is the diagonal one behind it.
    const blocked = (col: number) => col !== 4;

    const cell = findAttackCell({ x: 0, y: 5 }, { x: 5, y: 5 }, 1, blocked);

    expect(cell).toEqual({ x: 5, y: 4 });
  });

  it('returns undefined when nothing in reach of the target is available', () => {
    const cell = findAttackCell({ x: 0, y: 5 }, { x: 5, y: 5 }, 1, () => false);

    expect(cell).toBeUndefined();
  });

  it('returns undefined for a range of zero: no cell but the target’s own reaches it', () => {
    expect(findAttackCell({ x: 0, y: 0 }, { x: 5, y: 5 }, 0, anywhere)).toBeUndefined();
  });

  it('breaks ties deterministically, by lowest row then lowest column', () => {
    // Directly north of the target, equidistant from its NW and NE diagonals.
    const cell = findAttackCell({ x: 5, y: 0 }, { x: 5, y: 5 }, 1, anywhere);

    expect(cell).toEqual({ x: 5, y: 4 });

    // Two genuinely tied candidates (NW and NE of the target), reached from
    // due north but with the cell between them refused.
    const tied = findAttackCell({ x: 5, y: 0 }, { x: 5, y: 5 }, 1, (col) => col !== 5);

    expect(tied).toEqual({ x: 4, y: 4 });
  });

  it('only ever returns a cell within range of the target', () => {
    for (const range of [1, 2, 5]) {
      const cell = findAttackCell({ x: 0, y: 0 }, { x: 20, y: 13 }, range, anywhere);

      expect(cell).toBeDefined();
      expect(cellSteps(cell!, { x: 20, y: 13 })).toBeLessThanOrEqual(range);
    }
  });
});
