/**
 * Builds synthetic PCX buffers shaped like the original game's `.ART`
 * files.
 *
 * The real `.ART`/`.MAP` data is original commercial game content and is
 * deliberately not committed to this repository (see `docs/MAP_FORMAT.md`),
 * so decoder tests exercise hand-built buffers in this shape instead.
 */

const HEADER_SIZE = 128;

export interface PcxFixtureOptions {
  readonly width: number;
  readonly height: number;
  /**
   * Stored scanline stride. Defaults to `width`; set it larger to exercise
   * the padding that PCX allows at the end of each scanline.
   */
  readonly bytesPerLine?: number;
  /** One palette index per pixel, row-major, `width * height` long. */
  readonly indices: ArrayLike<number>;
  /** 256 RGB triples. Defaults to a greyscale ramp. */
  readonly palette?: ArrayLike<number>;
  /** Emit the trailing palette block. Defaults to true. */
  readonly withPalette?: boolean;
  /** Overrides for header fields, to build deliberately invalid files. */
  readonly header?: {
    readonly manufacturer?: number;
    readonly encoding?: number;
    readonly bitsPerPixel?: number;
    readonly planes?: number;
  };
}

/** A greyscale palette, so index N decodes to the colour (N, N, N). */
export function greyscalePalette(): Uint8Array {
  const palette = new Uint8Array(768);
  for (let i = 0; i < 256; i++) {
    palette[i * 3] = i;
    palette[i * 3 + 1] = i;
    palette[i * 3 + 2] = i;
  }
  return palette;
}

/** RLE-encodes one scanline the way the PCX spec describes. */
function encodeScanline(line: Uint8Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < line.length) {
    const value = line[i];
    let run = 1;
    while (run < 63 && i + run < line.length && line[i + run] === value) {
      run++;
    }
    // A lone byte still needs the run marker when its top two bits are set,
    // or a reader would mistake it for a packet header.
    if (run > 1 || (value & 0xc0) === 0xc0) {
      out.push(0xc0 | run, value);
    } else {
      out.push(value);
    }
    i += run;
  }
  return out;
}

/** Assembles a complete, byte-accurate PCX file. */
export function buildPcx(options: PcxFixtureOptions): Uint8Array {
  const {
    width,
    height,
    bytesPerLine = width,
    indices,
    palette = greyscalePalette(),
    withPalette = true,
    header = {},
  } = options;

  const bytes: number[] = new Array(HEADER_SIZE).fill(0);
  bytes[0] = header.manufacturer ?? 0x0a;
  bytes[1] = 5;
  bytes[2] = header.encoding ?? 1;
  bytes[3] = header.bitsPerPixel ?? 8;

  const writeU16 = (offset: number, value: number) => {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >> 8) & 0xff;
  };
  // The window is inclusive, so a WxH image ends at W-1, H-1.
  writeU16(4, 0);
  writeU16(6, 0);
  writeU16(8, width - 1);
  writeU16(10, height - 1);
  bytes[65] = header.planes ?? 1;
  writeU16(66, bytesPerLine);

  for (let y = 0; y < height; y++) {
    const line = new Uint8Array(bytesPerLine);
    for (let x = 0; x < width; x++) {
      line[x] = indices[y * width + x];
    }
    bytes.push(...encodeScanline(line));
  }

  if (withPalette) {
    bytes.push(0x0c);
    for (let i = 0; i < 768; i++) {
      bytes.push(palette[i] ?? 0);
    }
  }

  return Uint8Array.from(bytes);
}
