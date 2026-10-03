import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import type { PcxImage } from '../../src/lib/art/pcx';
import {
  UNIT_ATLAS_PATH,
  validateUnitManifest,
} from '../../src/game/render/sprites/unit-manifest';
import { frameBlock, pickFrames, type UnitFrameMap } from './frame-map';
import { encodeRgbaPng, FRAME_PADDING, packUnitAtlas } from './unit-sprites';

/**
 * A synthetic 8×16 atlas of 2×2 frames: palette 0 is the teal key, and
 * every other pixel's index encodes where it came from (row * 8 + column +
 * 1), so a packed pixel can be traced back to its atlas position.
 */
function syntheticImage(): PcxImage {
  const width = 8;
  const height = 16;
  const palette = new Uint8Array(768);
  palette.set([0, 251, 192], 0);
  for (let i = 1; i < 256; i++) palette.set([i, 255 - i, 7], i * 3);
  const indices = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Leave the top-left pixel of each 2×2 frame teal.
      indices[y * width + x] = x % 2 === 0 && y % 2 === 0 ? 0 : y * 8 + x + 1;
    }
  }
  return { width, height, indices, palette };
}

const rows = (y: number) => ({
  n: y,
  ne: y,
  e: y,
  se: y,
  s: y,
  sw: y,
  w: y,
  nw: y,
});

function syntheticMap(): UnitFrameMap {
  const move = frameBlock(0, rows(0), 3, [2, 2]);
  return {
    unit: 'swordsmen',
    anchor: [0.5, 0.5],
    playback: {
      idle: { fps: 0, loop: false },
      move: { fps: 10, loop: true },
      dead: { fps: 8, loop: false, holdLast: true },
    },
    teams: {
      red: {
        idle: pickFrames(move, { ...rows(2), n: 3 }),
        move,
        dead: frameBlock(0, rows(4), 2, [2, 2]),
      },
    },
  };
}

describe('packUnitAtlas', () => {
  const packed = packUnitAtlas(syntheticImage(), [syntheticMap()]);

  it('names every frame after its animation key, in playback order', () => {
    expect(packed.sheet.animations['swordsmen.red.move.e']).toEqual([
      'swordsmen.red.move.e_01',
      'swordsmen.red.move.e_02',
      'swordsmen.red.move.e_03',
    ]);
    expect(packed.sheet.animations['swordsmen.red.idle.n']).toEqual([
      'swordsmen.red.idle.n_01',
    ]);
    expect(Object.keys(packed.sheet.animations)).toHaveLength(3 * 8);
  });

  it('packs a frame shared by two animations once', () => {
    const { frames } = packed.sheet;
    expect(frames['swordsmen.red.idle.n_01'].frame).toEqual(
      frames['swordsmen.red.move.n_03'].frame
    );
    // Every direction uses the same three move frames here, so the move
    // animation takes one row, idle none, and dead one.
    expect(packed.height).toBe(2 * 2 + FRAME_PADDING);
    expect(packed.width).toBe(3 * 2 + 2 * FRAME_PADDING);
  });

  it('copies frames untrimmed with teal keyed to transparent black', () => {
    const { frame, sourceSize, spriteSourceSize } =
      packed.sheet.frames['swordsmen.red.move.s_02'];
    expect(sourceSize).toEqual({ w: 2, h: 2 });
    expect(spriteSourceSize).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    const at = (dx: number, dy: number) =>
      Array.from(
        packed.rgba.subarray(
          ((frame.y + dy) * packed.width + frame.x + dx) * 4,
          ((frame.y + dy) * packed.width + frame.x + dx) * 4 + 4
        )
      );
    expect(at(0, 0)).toEqual([0, 0, 0, 0]);
    // Atlas pixel (3, 0) of move frame 2 has index 0 * 8 + 3 + 1 = 4.
    expect(at(1, 0)).toEqual([4, 251, 7, 255]);
  });

  it('clears erased atlas pixels and leaves their neighbours alone', () => {
    const erased = packUnitAtlas(syntheticImage(), [
      { ...syntheticMap(), erase: [[3, 0]] },
    ]);
    const { frame } = erased.sheet.frames['swordsmen.red.move.s_02'];
    const at = (dx: number, dy: number) =>
      Array.from(
        erased.rgba.subarray(
          ((frame.y + dy) * erased.width + frame.x + dx) * 4,
          ((frame.y + dy) * erased.width + frame.x + dx) * 4 + 4
        )
      );
    expect(at(1, 0)).toEqual([0, 0, 0, 0]);
    // Atlas pixel (3, 1) has index 1 * 8 + 3 + 1 = 12.
    expect(at(1, 1)).toEqual([12, 243, 7, 255]);
  });

  it('emits a manifest that validates against the contract', () => {
    expect(Object.keys(packed.manifests)).toEqual(['swordsmen']);
    expect(validateUnitManifest(packed.manifests.swordsmen)).toEqual([]);
    expect(packed.manifests.swordsmen).toEqual({
      atlas: UNIT_ATLAS_PATH,
      frameSize: [2, 2],
      anchor: [0.5, 0.5],
      teams: ['red'],
      actions: {
        idle: { frames: 1, fps: 0, loop: false },
        move: { frames: 3, fps: 10, loop: true },
        dead: { frames: 2, fps: 8, loop: false, holdLast: true },
      },
    });
  });

  it('rejects animations whose frame sizes differ', () => {
    const map = syntheticMap();
    const bad: UnitFrameMap = {
      ...map,
      teams: {
        red: { ...map.teams.red, dead: frameBlock(0, rows(4), 2, [2, 4]) },
      },
    };
    expect(() => packUnitAtlas(syntheticImage(), [bad])).toThrow(/frame size/);
  });

  it('rejects an action without playback settings', () => {
    const map = syntheticMap();
    expect(() =>
      packUnitAtlas(syntheticImage(), [{ ...map, playback: {} }])
    ).toThrow(/playback/);
  });
});

describe('packUnitAtlas with several units', () => {
  /** A second unit whose frames sit lower in the synthetic atlas. */
  function knightMap(): UnitFrameMap {
    const move = frameBlock(0, rows(8), 2, [2, 2]);
    return {
      unit: 'knight',
      anchor: [0.5, 0.5],
      playback: { move: { fps: 10, loop: true } },
      teams: { blue: { move } },
    };
  }

  it('packs every unit into one sheet without key collisions', () => {
    const packed = packUnitAtlas(syntheticImage(), [
      syntheticMap(),
      knightMap(),
    ]);
    expect(Object.keys(packed.manifests).sort()).toEqual([
      'knight',
      'swordsmen',
    ]);
    expect(packed.sheet.animations['knight.blue.move.n']).toEqual([
      'knight.blue.move.n_01',
      'knight.blue.move.n_02',
    ]);
    expect(packed.sheet.animations['swordsmen.red.move.n']).toHaveLength(3);
    // Swordsmen move + dead rows, then one knight move row.
    expect(packed.height).toBe(3 * 2 + 2 * FRAME_PADDING);
  });

  it('does not depend on the order the frame maps are given in', () => {
    const a = packUnitAtlas(syntheticImage(), [syntheticMap(), knightMap()]);
    const b = packUnitAtlas(syntheticImage(), [knightMap(), syntheticMap()]);
    expect(b.sheet).toEqual(a.sheet);
    expect(encodeRgbaPng(b).equals(encodeRgbaPng(a))).toBe(true);
  });

  it('rejects two frame maps for the same unit', () => {
    expect(() =>
      packUnitAtlas(syntheticImage(), [syntheticMap(), syntheticMap()])
    ).toThrow(/more than one/);
  });
});

describe('encodeRgbaPng', () => {
  it('writes an RGBA PNG (colour type 6) that round-trips', () => {
    const packed = packUnitAtlas(syntheticImage(), [syntheticMap()]);
    const bytes = encodeRgbaPng(packed);
    expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(bytes[25]).toBe(6);
    expect(new Uint8Array(PNG.sync.read(bytes).data)).toEqual(
      new Uint8Array(packed.rgba)
    );
  });
});
