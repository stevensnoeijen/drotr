import { PNG } from 'pngjs';

import type { PcxImage } from '../../src/lib/art/pcx';
import { extractRgbaRect, type RgbaPixels } from '../../src/lib/art/rgba';
import {
  ANIMATION_TEAMS,
  DIRECTIONS,
  UNIT_ACTIONS,
  animationKey,
  frameName,
  type AnimationKey,
} from '../../src/game/render/sprites/animation-key';
import {
  parseUnitManifest,
  type ActionManifest,
  type UnitManifest,
} from '../../src/game/render/sprites/unit-manifest';
import { frameRect, type AtlasRect, type UnitFrameMap } from './frame-map';

/**
 * Cuts a unit's frames out of the decoded `BATTLE.ART` at the rects of its
 * {@link UnitFrameMap} and packs them into one straight-RGBA Pixi v8
 * spritesheet, plus the unit's manifest.
 *
 * Frames are copied untrimmed (teal keyed to alpha, nothing else touched),
 * so every frame of an animation keeps its size and pivot. A frame that
 * several animations share (idle reuses a move frame) is packed once and
 * named once per animation.
 */

/** Transparent gap between packed frames, so filtering never bleeds a neighbour in. */
export const FRAME_PADDING = 2;

/**
 * Order actions are packed in: actions that borrow frames (idle reuses a
 * move frame) come last, so they find their frames already packed instead
 * of each starting a near-empty row of their own.
 */
const PACK_ORDER = [...UNIT_ACTIONS].sort(
  (a, b) => Number(a === 'idle') - Number(b === 'idle')
);

/** One frame entry of a Pixi spritesheet JSON (the untrimmed subset). */
export interface SheetFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: false;
  spriteSourceSize: { x: 0; y: 0; w: number; h: number };
  sourceSize: { w: number; h: number };
}

/** Pixi v8 spritesheet JSON, as read by `Assets.load` / `Spritesheet`. */
export interface SheetJson {
  frames: Record<string, SheetFrame>;
  animations: Record<AnimationKey, string[]>;
  meta: {
    app: string;
    image: string;
    format: 'RGBA8888';
    size: { w: number; h: number };
    scale: 1;
  };
}

export interface PackedUnitSprites {
  readonly width: number;
  readonly height: number;
  readonly rgba: RgbaPixels;
  readonly sheet: SheetJson;
  readonly manifest: UnitManifest;
}

const rectId = (r: AtlasRect) => `${r.x},${r.y},${r.width},${r.height}`;

/**
 * Packs `map` out of `image`. Each animation × direction starts a new row of
 * the sheet, holding only the frames not already packed for an earlier one.
 *
 * @throws {Error} if a frame map animation has the wrong frame count for
 * its action, or the result isn't a valid manifest.
 */
export function packUnitSprites(
  image: PcxImage,
  map: UnitFrameMap,
  imageName = `${map.unit}.png`
): PackedUnitSprites {
  const teams = ANIMATION_TEAMS.filter((t) => map.teams[t] !== undefined);

  interface Placed {
    rect: AtlasRect;
    x: number;
    y: number;
  }
  const placed = new Map<string, Placed>();
  const animations = {} as Record<AnimationKey, string[]>;
  const frameRefs: [string, Placed][] = [];
  const actions: UnitManifest['actions'] = {};
  let frameSize: [number, number] | undefined;

  let width = 0;
  let cursorY = 0;
  for (const team of teams) {
    for (const action of PACK_ORDER) {
      const animation = map.teams[team]![action];
      if (!animation) continue;
      const [w, h] = animation.size;
      frameSize ??= [w, h];
      if (frameSize[0] !== w || frameSize[1] !== h) {
        throw new Error(
          `${map.unit}.${team}.${action}: frame size ${w}x${h} differs from the unit's ${frameSize[0]}x${frameSize[1]}`
        );
      }
      const count = animation.frames[DIRECTIONS[0]].length;
      const playback = map.playback[action];
      if (!playback) {
        throw new Error(`${map.unit}: no playback settings for ${action}`);
      }
      const declared: ActionManifest = { frames: count, ...playback };
      const previous = actions[action];
      if (previous && previous.frames !== count) {
        throw new Error(
          `${map.unit}.${action}: ${team} has ${count} frames, another team ${previous.frames}`
        );
      }
      actions[action] = declared;

      for (const direction of DIRECTIONS) {
        const frames = animation.frames[direction];
        if (frames.length !== count) {
          throw new Error(
            `${map.unit}.${team}.${action}.${direction}: ${frames.length} frames, expected ${count}`
          );
        }
        const key = animationKey(map.unit, team, action, direction);
        const names: string[] = [];
        let cursorX = 0;
        let rowUsed = false;
        frames.forEach((_, i) => {
          const rect = frameRect(animation, direction, i);
          let spot = placed.get(rectId(rect));
          if (!spot) {
            spot = { rect, x: cursorX, y: cursorY };
            placed.set(rectId(rect), spot);
            cursorX += w + FRAME_PADDING;
            width = Math.max(width, cursorX - FRAME_PADDING);
            rowUsed = true;
          }
          const name = frameName(key, i + 1);
          names.push(name);
          frameRefs.push([name, spot]);
        });
        animations[key] = names;
        if (rowUsed) cursorY += h + FRAME_PADDING;
      }
    }
  }
  if (!frameSize) {
    throw new Error(`${map.unit}: frame map has no animations`);
  }
  const height = Math.max(0, cursorY - FRAME_PADDING);

  const rgba = new Uint8ClampedArray(width * height * 4) as RgbaPixels;
  for (const spot of placed.values()) {
    const pixels = extractRgbaRect(image, spot.rect);
    const rowBytes = spot.rect.width * 4;
    for (let row = 0; row < spot.rect.height; row++) {
      rgba.set(
        pixels.subarray(row * rowBytes, (row + 1) * rowBytes),
        ((spot.y + row) * width + spot.x) * 4
      );
    }
  }

  const frames: Record<string, SheetFrame> = {};
  for (const [name, { rect, x, y }] of frameRefs) {
    frames[name] = {
      frame: { x, y, w: rect.width, h: rect.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: rect.width, h: rect.height },
      sourceSize: { w: rect.width, h: rect.height },
    };
  }

  // List actions in their canonical order, not packing order.
  const orderedActions = Object.fromEntries(
    UNIT_ACTIONS.filter((a) => actions[a]).map((a) => [a, actions[a]])
  );
  const manifest = parseUnitManifest({
    frameSize,
    anchor: [...map.anchor],
    teams,
    actions: orderedActions,
  });

  return {
    width,
    height,
    rgba,
    sheet: {
      frames,
      animations,
      meta: {
        app: 'drotr scripts/unit-sprites',
        image: imageName,
        format: 'RGBA8888',
        size: { w: width, h: height },
        scale: 1,
      },
    },
    manifest,
  };
}

/**
 * Encodes a packed sheet as a truecolour-with-alpha PNG (colour type 6),
 * never a palette image, so the art keeps its full colour depth.
 */
export function encodeRgbaPng(packed: {
  width: number;
  height: number;
  rgba: RgbaPixels;
}): Buffer {
  const png = new PNG({
    width: packed.width,
    height: packed.height,
    colorType: 6,
    inputColorType: 6,
    bitDepth: 8,
  });
  png.data = Buffer.from(
    packed.rgba.buffer,
    packed.rgba.byteOffset,
    packed.rgba.byteLength
  );
  return PNG.sync.write(png, { colorType: 6, inputColorType: 6 });
}
