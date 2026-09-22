import { describe, expect, it } from 'vitest';

import { buildPcx, greyscalePalette } from '~/test/pcx-fixture';

import { decodePcx, PcxDecodeError } from './pcx';

describe('decodePcx', () => {
  it('reads the image size from the inclusive window in the header', () => {
    const image = decodePcx(
      buildPcx({ width: 4, height: 3, indices: new Uint8Array(12) })
    );

    expect(image.width).toEqual(4);
    expect(image.height).toEqual(3);
    expect(image.indices).toHaveLength(12);
  });

  it('returns the trailing 256-colour palette', () => {
    const image = decodePcx(buildPcx({ width: 1, height: 1, indices: [7] }));

    expect(image.palette).toHaveLength(768);
    expect(Array.from(image.palette.slice(21, 24))).toEqual([7, 7, 7]);
  });

  it('expands run-length packets', () => {
    // A 64-wide row of one value cannot fit in a single packet (the count
    // is six bits), so this also covers runs spanning multiple packets.
    const indices = new Uint8Array(64).fill(200);
    const image = decodePcx(buildPcx({ width: 64, height: 1, indices }));

    expect(Array.from(image.indices)).toEqual(Array.from(indices));
  });

  it('keeps literal bytes that are not run packets', () => {
    const indices = [1, 2, 3, 4, 5, 6];
    const image = decodePcx(buildPcx({ width: 6, height: 1, indices }));

    expect(Array.from(image.indices)).toEqual(indices);
  });

  it('round-trips values whose high bits collide with the run marker', () => {
    // 0xc0..0xff are exactly the bytes a reader would otherwise mistake for
    // a packet header, so they must survive a round trip unchanged.
    const indices = [0xc0, 0xc1, 0xfe, 0xff, 0x3f, 0xbf];
    const image = decodePcx(buildPcx({ width: 6, height: 1, indices }));

    expect(Array.from(image.indices)).toEqual(indices);
  });

  it('preserves row order across scanlines', () => {
    const indices = [1, 2, 3, 4, 5, 6];
    const image = decodePcx(buildPcx({ width: 3, height: 2, indices }));

    expect(Array.from(image.indices)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('strips per-scanline padding so rows stay width-aligned', () => {
    const indices = [1, 2, 9, 9];
    const image = decodePcx(
      buildPcx({ width: 2, height: 2, bytesPerLine: 6, indices })
    );

    expect(image.width).toEqual(2);
    expect(Array.from(image.indices)).toEqual([1, 2, 9, 9]);
  });

  it('rejects a buffer that is not a PCX image', () => {
    const bytes = buildPcx({
      width: 1,
      height: 1,
      indices: [0],
      header: { manufacturer: 0x42 },
    });

    expect(() => decodePcx(bytes)).toThrow(PcxDecodeError);
    expect(() => decodePcx(bytes)).toThrow(/not a PCX image/);
  });

  it('rejects an uncompressed PCX', () => {
    const bytes = buildPcx({
      width: 1,
      height: 1,
      indices: [0],
      header: { encoding: 0 },
    });

    expect(() => decodePcx(bytes)).toThrow(/unsupported PCX encoding/);
  });

  it('rejects a pixel format other than 8bpp on a single plane', () => {
    const fourBit = buildPcx({
      width: 1,
      height: 1,
      indices: [0],
      header: { bitsPerPixel: 4 },
    });
    const threePlane = buildPcx({
      width: 1,
      height: 1,
      indices: [0],
      header: { planes: 3 },
    });

    expect(() => decodePcx(fourBit)).toThrow(/unsupported PCX pixel format/);
    expect(() => decodePcx(threePlane)).toThrow(/unsupported PCX pixel format/);
  });

  it('rejects a file with no trailing palette', () => {
    // Non-repeating so it encodes as literals and the file comfortably
    // exceeds the minimum length, letting the palette check be what fires.
    const indices = new Uint8Array(4096);
    for (let i = 0; i < indices.length; i++) {
      indices[i] = i % 64;
    }
    const bytes = buildPcx({
      width: 64,
      height: 64,
      indices,
      withPalette: false,
    });

    expect(() => decodePcx(bytes)).toThrow(/palette marker/);
  });

  it('rejects a buffer too short to hold a header and palette', () => {
    expect(() => decodePcx(new Uint8Array(16))).toThrow(/too small/);
  });

  it('rejects pixel data that ends before the last scanline', () => {
    const full = buildPcx({
      width: 8,
      height: 8,
      indices: new Uint8Array(64),
    });
    // Drop the encoded pixel bytes, keeping header and palette intact.
    const truncated = new Uint8Array(128 + 769);
    truncated.set(full.slice(0, 128), 0);
    truncated.set(full.slice(full.length - 769), 128);

    expect(() => decodePcx(truncated)).toThrow(/ended early/);
  });

  it('decodes a palettised gradient back to its original indices', () => {
    const width = 17;
    const height = 5;
    const indices = new Uint8Array(width * height);
    for (let i = 0; i < indices.length; i++) {
      indices[i] = (i * 13) % 256;
    }

    const image = decodePcx(
      buildPcx({ width, height, indices, palette: greyscalePalette() })
    );

    expect(Array.from(image.indices)).toEqual(Array.from(indices));
  });
});
