import { PNG } from 'pngjs';

import { UNIT_TYPES, type UnitType } from '../../src/game/data/units';
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
  UNIT_ATLAS_PATH,
  parseUnitManifest,
  type ActionManifest,
  type UnitManifest,
} from '../../src/game/render/sprites/unit-manifest';
import { frameRect, type AtlasRect, type UnitFrameMap } from './frame-map';

/**
 * Cuts every unit's frames out of the decoded `BATTLE.ART` at the rects of
 * its {@link UnitFrameMap} and packs them all into one shared straight-RGBA
 * Pixi v8 atlas, plus one manifest per unit.
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

export interface PackedUnitAtlas {
  readonly width: number;
  readonly height: number;
  readonly rgba: RgbaPixels;
  readonly sheet: SheetJson;
  /** One manifest per packed unit. */
  readonly manifests: Partial<Record<UnitType, UnitManifest>>;
}

const rectId = (r: AtlasRect) => `${r.x},${r.y},${r.width},${r.height}`;

interface Placed {
  rect: AtlasRect;
  x: number;
  y: number;
}

/** Layout state shared by every unit packed into one atlas. */
interface AtlasLayout {
  placed: Map<string, Placed>;
  animations: Record<string, string[]>;
  frameRefs: [string, Placed][];
  width: number;
  cursorY: number;
}

/**
 * Appends one unit's frames to `layout` and returns its manifest. Each
 * animation × direction starts a new row, holding only the frames not
 * already packed for an earlier one.
 */
function packUnit(
  layout: AtlasLayout,
  map: UnitFrameMap,
  atlas: string
): UnitManifest {
  const teams = ANIMATION_TEAMS.filter((t) => map.teams[t] !== undefined);
  const actions: UnitManifest['actions'] = {};
  let frameSize: [number, number] | undefined;

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
      const directions = DIRECTIONS.filter(
        (d) => !animation.directions || animation.directions.includes(d)
      );
      const declared: ActionManifest = {
        frames: count,
        ...playback,
        ...(directions.length < DIRECTIONS.length ? { directions } : {}),
      };
      const previous = actions[action];
      if (previous && previous.frames !== count) {
        throw new Error(
          `${map.unit}.${action}: ${team} has ${count} frames, another team ${previous.frames}`
        );
      }
      if (
        previous &&
        (previous.directions ?? []).join() !== (declared.directions ?? []).join()
      ) {
        throw new Error(
          `${map.unit}.${action}: ${team} has different directions than another team`
        );
      }
      actions[action] = declared;

      for (const direction of directions) {
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
          let spot = layout.placed.get(rectId(rect));
          if (!spot) {
            spot = { rect, x: cursorX, y: layout.cursorY };
            layout.placed.set(rectId(rect), spot);
            cursorX += w + FRAME_PADDING;
            layout.width = Math.max(layout.width, cursorX - FRAME_PADDING);
            rowUsed = true;
          }
          const name = frameName(key, i + 1);
          names.push(name);
          layout.frameRefs.push([name, spot]);
        });
        layout.animations[key] = names;
        if (rowUsed) layout.cursorY += h + FRAME_PADDING;
      }
    }
  }
  if (!frameSize) {
    throw new Error(`${map.unit}: frame map has no animations`);
  }

  // List actions in their canonical order, not packing order.
  const orderedActions = Object.fromEntries(
    UNIT_ACTIONS.filter((a) => actions[a]).map((a) => [a, actions[a]])
  );
  return parseUnitManifest({
    atlas,
    frameSize,
    anchor: [...map.anchor],
    teams,
    actions: orderedActions,
  });
}

/**
 * Packs every frame map in `maps` out of `image` into one shared atlas,
 * units in `UNIT_TYPES` order so the result doesn't depend on the order
 * `maps` lists them in.
 *
 * Animation keys already start with the unit type
 * (`swordsmen.red.move.n`), so units cannot collide in the shared
 * `animations` map without any further prefix.
 *
 * @throws {Error} if a unit appears twice, a frame map animation has the
 * wrong frame count for its action, or a result isn't a valid manifest.
 */
export function packUnitAtlas(
  image: PcxImage,
  maps: readonly UnitFrameMap[],
  imageName = 'units.png',
  atlasPath = UNIT_ATLAS_PATH
): PackedUnitAtlas {
  const seen = new Set<UnitType>();
  for (const map of maps) {
    if (seen.has(map.unit)) {
      throw new Error(`${map.unit}: more than one frame map`);
    }
    seen.add(map.unit);
  }
  const ordered = [...maps].sort(
    (a, b) => UNIT_TYPES.indexOf(a.unit) - UNIT_TYPES.indexOf(b.unit)
  );

  const layout: AtlasLayout = {
    placed: new Map(),
    animations: {},
    frameRefs: [],
    width: 0,
    cursorY: 0,
  };
  const manifests: Partial<Record<UnitType, UnitManifest>> = {};
  for (const map of ordered) {
    manifests[map.unit] = packUnit(layout, map, atlasPath);
  }

  const erase = ordered.flatMap((map) => map.erase ?? []);
  const { width } = layout;
  const height = Math.max(0, layout.cursorY - FRAME_PADDING);
  const rgba = new Uint8ClampedArray(width * height * 4) as RgbaPixels;
  for (const spot of layout.placed.values()) {
    const pixels = extractRgbaRect(image, spot.rect);
    for (const [ex, ey] of erase) {
      const col = ex - spot.rect.x;
      const row = ey - spot.rect.y;
      if (
        col < 0 ||
        row < 0 ||
        col >= spot.rect.width ||
        row >= spot.rect.height
      ) {
        continue;
      }
      pixels.fill(
        0,
        (row * spot.rect.width + col) * 4,
        (row * spot.rect.width + col + 1) * 4
      );
    }
    const rowBytes = spot.rect.width * 4;
    for (let row = 0; row < spot.rect.height; row++) {
      rgba.set(
        pixels.subarray(row * rowBytes, (row + 1) * rowBytes),
        ((spot.y + row) * width + spot.x) * 4
      );
    }
  }

  const frames: Record<string, SheetFrame> = {};
  for (const [name, { rect, x, y }] of layout.frameRefs) {
    frames[name] = {
      frame: { x, y, w: rect.width, h: rect.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: rect.width, h: rect.height },
      sourceSize: { w: rect.width, h: rect.height },
    };
  }

  return {
    width,
    height,
    rgba,
    sheet: {
      frames,
      animations: layout.animations as Record<AnimationKey, string[]>,
      meta: {
        app: 'drotr scripts/unit-sprites',
        image: imageName,
        format: 'RGBA8888',
        size: { w: width, h: height },
        scale: 1,
      },
    },
    manifests,
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
