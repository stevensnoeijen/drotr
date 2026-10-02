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

  describe('with a multi-cell target or attacker', () => {
    // A 2x2 target anchored at (5, 5), covering cells (5..6, 5..6).
    const target = { x: 5, y: 5 };
    const targetSize = { width: 2, height: 2 };

    it('finds a cell adjacent to the near edge of a large target, approaching from one side', () => {
      const cell = findAttackCell({ x: 0, y: 5 }, target, 1, anywhere, undefined, targetSize);

      // Column 4 is the near (west) edge of the target's block; the
      // attacker's own row is on that edge too.
      expect(cell).toEqual({ x: 4, y: 5 });
    });

    it('never picks a cell overlapping the large target\'s own footprint', () => {
      for (let y = 3; y <= 7; y++) {
        for (let x = 3; x <= 7; x++) {
          const cell = findAttackCell({ x, y }, target, 1, anywhere, undefined, targetSize);
          if (!cell) continue;
          expect(cell.x >= 5 && cell.x <= 6 && cell.y >= 5 && cell.y <= 6).toBe(false);
        }
      }
    });

    it('lets a large (2x2) attacker reach a 1x1 target, never overlapping it', () => {
      const selfSize = { width: 2, height: 2 };
      const smallTarget = { x: 10, y: 10 };

      const cell = findAttackCell({ x: 0, y: 10 }, smallTarget, 1, anywhere, selfSize);

      expect(cell).toBeDefined();
      // The attacker's own 2x2 block, anchored at `cell`, must not cover
      // the target's cell.
      const overlapsTarget =
        smallTarget.x >= cell!.x &&
        smallTarget.x < cell!.x + selfSize.width &&
        smallTarget.y >= cell!.y &&
        smallTarget.y < cell!.y + selfSize.height;
      expect(overlapsTarget).toBe(false);
      expect(cellSteps(cell!, smallTarget)).toBeLessThanOrEqual(1 + (selfSize.width - 1));
    });

    it('reduces to the plain single-cell search when both sizes are 1x1', () => {
      const withDefaults = findAttackCell({ x: 0, y: 5 }, { x: 5, y: 5 }, 1, anywhere);
      const withExplicitOnes = findAttackCell(
        { x: 0, y: 5 },
        { x: 5, y: 5 },
        1,
        anywhere,
        { width: 1, height: 1 },
        { width: 1, height: 1 }
      );

      expect(withExplicitOnes).toEqual(withDefaults);
    });
  });
});
