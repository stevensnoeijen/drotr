import { describe, expect, it } from 'vitest';

import { DIRECTIONS } from '../../src/game/render/sprites/animation-key';
import { frameBlock, pickFrames, sequenceFrames } from './frame-map';
import { IDLE_PICK, SWORDSMEN_FRAME_MAP } from './frame-maps/swordsmen';

describe('swordsmen frame map', () => {
  const expectedCounts = { idle: 1, move: 8, attack: 12, dead: 4 } as const;

  it('covers both teams', () => {
    expect(Object.keys(SWORDSMEN_FRAME_MAP.teams).sort()).toEqual([
      'blue',
      'red',
    ]);
  });

  for (const team of ['blue', 'red'] as const) {
    for (const [action, count] of Object.entries(expectedCounts)) {
      it(`has ${count} ${team} ${action} frames in every direction, all the same size`, () => {
        const animation =
          SWORDSMEN_FRAME_MAP.teams[team]?.[
            action as keyof typeof expectedCounts
          ];
        expect(animation).toBeDefined();
        expect(animation!.size).toEqual([32, 32]);
        for (const direction of DIRECTIONS) {
          const frames = animation!.frames[direction];
          expect(frames).toHaveLength(count);
          for (const [x, y] of frames) {
            expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
            expect(x + animation!.size[0]).toBeLessThanOrEqual(640);
          }
        }
      });
    }
  }

  it('plays every multi-frame animation left to right along its atlas row', () => {
    for (const team of Object.values(SWORDSMEN_FRAME_MAP.teams)) {
      for (const action of ['move', 'attack', 'dead'] as const) {
        for (const direction of DIRECTIONS) {
          const frames = team![action]!.frames[direction];
          frames.forEach(([x, y], i) => {
            expect(y).toBe(frames[0][1]);
            expect(x).toBe(frames[0][0] + i * 32);
          });
        }
      }
    }
  });

  it('takes idle from the committed move-frame pick', () => {
    for (const team of ['blue', 'red'] as const) {
      const { idle, move } = SWORDSMEN_FRAME_MAP.teams[team]!;
      for (const direction of DIRECTIONS) {
        expect(idle!.frames[direction][0]).toEqual(
          move!.frames[direction][IDLE_PICK[team][direction] - 1]
        );
      }
    }
  });
});

describe('frame map helpers', () => {
  const rows = { n: 0, ne: 10, e: 20, se: 30, s: 40, sw: 50, w: 60, nw: 70 };

  it('builds a block of rows at the measured origins', () => {
    const block = frameBlock(5, rows, 3, [4, 10]);
    expect(block.frames.e).toEqual([
      [5, 20],
      [9, 20],
      [13, 20],
    ]);
  });

  it('plays source frames in the given order, repeats included', () => {
    const block = frameBlock(0, rows, 3, [4, 10]);
    expect(sequenceFrames(block, [0, 0, 2, 1]).frames.n).toEqual([
      [0, 0],
      [0, 0],
      [8, 0],
      [4, 0],
    ]);
  });

  it('rejects a sequence outside the source animation', () => {
    const block = frameBlock(0, rows, 2);
    expect(() => sequenceFrames(block, [0, 2])).toThrow(RangeError);
  });

  it('rejects a pick outside the source animation', () => {
    const block = frameBlock(0, rows, 2);
    expect(() =>
      pickFrames(block, { n: 3, ne: 1, e: 1, se: 1, s: 1, sw: 1, w: 1, nw: 1 })
    ).toThrow(RangeError);
  });
});
