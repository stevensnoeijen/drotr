import type { UnitType } from '../../src/game/data/units';
import type { ActionManifest } from '../../src/game/render/sprites/unit-manifest';
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
  /**
   * The directions this animation has frames for; omitted means all eight.
   * Directions not listed are not packed and the manifest records the subset.
   */
  readonly directions?: readonly Direction[];
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

/** Playback settings of one action; its frame count comes from the frames themselves. */
export type ActionPlayback = Omit<ActionManifest, 'frames'>;

export interface UnitFrameMap {
  readonly unit: UnitType;
  readonly teams: Readonly<Partial<Record<AnimationTeam, FrameMapTeam>>>;
  /** Normalised `[x, y]` point of each frame placed on the unit position. */
  readonly anchor: readonly [number, number];
  /** Playback settings for every action the teams have frames for. */
  readonly playback: Readonly<Partial<Record<UnitAction, ActionPlayback>>>;
  /**
   * `BATTLE.ART` pixels `[x, y]` to clear in every frame that covers them:
   * stray pixels that are not part of the figure, such as a sword tip from
   * the next atlas row reaching into a frame's edge.
   */
  readonly erase?: readonly (readonly [number, number])[];
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

/**
 * Re-times an animation by listing which source frames play, in order:
 * `order` holds 0-based indices into the source frames and may repeat or
 * skip them, so holding a pose lengthens the animation without new art.
 */
export function sequenceFrames(
  source: FrameMapAnimation,
  order: readonly number[]
): FrameMapAnimation {
  const frames = Object.fromEntries(
    DIRECTIONS.map((d) => [
      d,
      order.map((index) => {
        const frame = source.frames[d][index];
        if (!frame) {
          throw new RangeError(`no frame ${index} in direction ${d}`);
        }
        return frame;
      }),
    ])
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
