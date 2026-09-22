import { describe, expect, it } from 'vitest';

import { buildPcx } from '~/test/pcx-fixture';

import { decodePcx } from './pcx';
import { extractRgbaRect, TEAL_COLOR_KEY, toRgba } from './rgba';

/**
 * A palette whose entry 37 is the teal colour key — the slot it occupies in
 * the original `BATTLE.ART` — and whose other entries are distinct opaque
 * colours.
 */
function paletteWithColorKey(): Uint8Array {
  const palette = new Uint8Array(768);
  for (let i = 0; i < 256; i++) {
    palette[i * 3] = i;
    palette[i * 3 + 1] = 255 - i;
    palette[i * 3 + 2] = (i * 7) % 256;
  }
  palette[37 * 3] = TEAL_COLOR_KEY.r;
  palette[37 * 3 + 1] = TEAL_COLOR_KEY.g;
  palette[37 * 3 + 2] = TEAL_COLOR_KEY.b;
  return palette;
}

function imageWith(indices: number[], width: number, height: number) {
  return decodePcx(
    buildPcx({ width, height, indices, palette: paletteWithColorKey() })
  );
}

describe('toRgba', () => {
  it('resolves palette indices to their colours at full alpha', () => {
    const rgba = toRgba(imageWith([1], 1, 1));

    expect(Array.from(rgba)).toEqual([1, 254, 7, 255]);
  });

  it('turns the colour key into transparency', () => {
    const rgba = toRgba(imageWith([37], 1, 1));

    expect(rgba[3]).toEqual(0);
  });

  it('zeroes the colour channels of keyed pixels so teal cannot bleed', () => {
    const rgba = toRgba(imageWith([37], 1, 1));

    expect(Array.from(rgba)).toEqual([0, 0, 0, 0]);
  });

  it('leaves no keyed pixel opaque', () => {
    const indices = [37, 1, 37, 2, 3, 37];
    const rgba = toRgba(imageWith(indices, 6, 1));

    for (let i = 0; i < indices.length; i++) {
      const opaque = rgba[i * 4 + 3] === 255;
      expect(opaque).toEqual(indices[i] !== 37);
    }
  });

  it('keeps every pixel opaque when no colour key is given', () => {
    const rgba = toRgba(imageWith([37, 1], 2, 1), null);

    expect(rgba[3]).toEqual(255);
    expect(Array.from(rgba.slice(0, 3))).toEqual([
      TEAL_COLOR_KEY.r,
      TEAL_COLOR_KEY.g,
      TEAL_COLOR_KEY.b,
    ]);
  });

  it('emits four bytes for every pixel, in row-major order', () => {
    const rgba = toRgba(imageWith([1, 2, 3, 4, 5, 6], 3, 2));

    expect(rgba).toHaveLength(3 * 2 * 4);
    expect(Array.from(rgba.slice(12, 16))).toEqual([4, 251, 28, 255]);
  });
});

describe('extractRgbaRect', () => {
  it('copies out a sub-rectangle tightly packed', () => {
    // 4x4 image whose value is its own index, so the crop is easy to read.
    const indices = Array.from({ length: 16 }, (_, i) => i);
    const rect = extractRgbaRect(imageWith(indices, 4, 4), {
      x: 1,
      y: 1,
      width: 2,
      height: 2,
    });

    expect(rect).toHaveLength(2 * 2 * 4);
    // Rows 1 and 2, columns 1 and 2 => indices 5, 6, 9, 10.
    expect([rect[0], rect[4], rect[8], rect[12]]).toEqual([5, 6, 9, 10]);
  });

  it('applies the colour key inside the crop', () => {
    const indices = [0, 37, 0, 0];
    const rect = extractRgbaRect(imageWith(indices, 2, 2), {
      x: 1,
      y: 0,
      width: 1,
      height: 1,
    });

    expect(rect[3]).toEqual(0);
  });

  it('rejects a rectangle reaching past the image', () => {
    const image = imageWith([0, 0, 0, 0], 2, 2);

    expect(() =>
      extractRgbaRect(image, { x: 1, y: 0, width: 2, height: 1 })
    ).toThrow(RangeError);
    expect(() =>
      extractRgbaRect(image, { x: -1, y: 0, width: 1, height: 1 })
    ).toThrow(RangeError);
  });
});
