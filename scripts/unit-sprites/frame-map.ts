import type { UnitType } from '../../src/game/data/units';
import {
  DIRECTIONS,
  type AnimationTeam,
  type Direction,
  type UnitAction,
} from '../../src/game/render/sprites/animation-key';

/**
 * A unit's frame map: the exact `BATTLE.ART` rectangle of every frame, per
 * team × action × direction. Unit frames do not sit on the atlas's 40 px
 * tile grid, nor on any uniform grid (row pitch varies between 31 and
 * 32 px), so the rects are measured and written down rather than derived.
 *
 * Frames are listed in playback order. Every frame of one animation has
 * the same, untrimmed size, so all frames share one pivot.
 */
export interface FrameMapAnimation {
  /** Width and height of every frame in this animation. */
  readonly size: readonly [number, number];
  /** Top-left atlas corner `[x, y]` of each frame, per direction, in playback order. */
  readonly frames: Readonly<
    Record<Direction, readonly (readonly [number, number])[]>
  >;
}

export type FrameMapTeam = Readonly<
  Partial<Record<UnitAction, FrameMapAnimation>>
>;

export interface UnitFrameMap {
  readonly unit: UnitType;
  readonly teams: Readonly<Partial<Record<AnimationTeam, FrameMapTeam>>>;
}

/** An atlas rectangle in pixels. */
export interface AtlasRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Builds one direction's frame list: `count` frames left to right from `x`, at row `y`. */
export function frameRow(
  x: number,
  y: number,
  count: number,
  pitch = 32
): [number, number][] {
  return Array.from({ length: count }, (_, i) => [x + i * pitch, y]);
}

/**
 * Builds a whole animation from a block of rows: one row per direction (in
 * {@link DIRECTIONS} order), each starting at `x`, at the measured `rowY`.
 */
export function frameBlock(
  x: number,
  rowY: Readonly<Record<Direction, number>>,
  count: number,
  size: readonly [number, number] = [32, 32]
): FrameMapAnimation {
  const frames = Object.fromEntries(
    DIRECTIONS.map((d) => [d, frameRow(x, rowY[d], count, size[0])])
  ) as Record<Direction, [number, number][]>;
  return { size, frames };
}

/**
 * A single-frame animation that reuses one chosen frame of another
 * animation per direction (`idle` reuses a frame of the move cycle).
 * `pick` holds a 1-based frame number per direction.
 */
export function pickFrames(
  source: FrameMapAnimation,
  pick: Readonly<Record<Direction, number>>
): FrameMapAnimation {
  const frames = Object.fromEntries(
    DIRECTIONS.map((d) => {
      const frame = source.frames[d][pick[d] - 1];
      if (!frame) {
        throw new RangeError(`no frame ${pick[d]} in direction ${d}`);
      }
      return [d, [frame]];
    })
  ) as Record<Direction, (readonly [number, number])[]>;
  return { size: source.size, frames };
}

/** The atlas rect of one frame. */
export function frameRect(
  animation: FrameMapAnimation,
  direction: Direction,
  index: number
): AtlasRect {
  const [x, y] = animation.frames[direction][index];
  return { x, y, width: animation.size[0], height: animation.size[1] };
}
