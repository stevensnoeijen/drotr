/**
 * Decoder for the original game's `.ART` files (`ART/BATTLE.ART` and
 * friends).
 *
 * Despite the extension, an `.ART` file is not a bespoke container: it is a
 * plain ZSoft PCX version 5 image — 8 bits per pixel, a single plane,
 * run-length encoded, with a 256-entry RGB palette appended to the end of
 * the file behind a `0x0C` marker byte. Every `.ART` file on the CD
 * (`BATTLE`, `COUNCIL`, `CREDITS`, `DEMO`, `LOADING`, `MENU`) shares that
 * exact shape, so one decoder covers all of them.
 */

/** Fixed size of the PCX header that precedes the pixel data. */
const HEADER_SIZE = 128;

/** Size of the trailing palette block: a `0x0C` marker plus 256 RGB triples. */
const PALETTE_BLOCK_SIZE = 1 + 256 * 3;

/** `0x0A`, ZSoft's manufacturer byte, at offset 0 of every PCX file. */
const MANUFACTURER_ZSOFT = 0x0a;

/** Marker byte introducing the trailing 256-colour palette. */
const PALETTE_MARKER = 0x0c;

/** Encoding byte value meaning "run-length encoded". */
const ENCODING_RLE = 1;

/**
 * A run-length packet is marked by its top two bits being set; the low six
 * bits hold the repeat count and the following byte holds the value.
 */
const RUN_MASK = 0xc0;

/** A decoded `.ART`/PCX image: palette indices plus the palette itself. */
export interface PcxImage {
  readonly width: number;
  readonly height: number;
  /**
   * One palette index per pixel, row-major, exactly `width * height` bytes.
   * Any per-scanline padding the file carried has already been stripped.
   */
  readonly indices: Uint8Array;
  /** 256 RGB triples (768 bytes), already at full 8-bit range. */
  readonly palette: Uint8Array;
}

/** Thrown when a buffer isn't a PCX image this decoder can handle. */
export class PcxDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PcxDecodeError';
  }
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

/**
 * Decodes an `.ART`/PCX buffer into palette indices plus its palette.
 *
 * Colour lookup is deliberately left to the caller: the atlas uses one
 * palette entry as a transparency colour key, and resolving that is a
 * separate concern from unpacking the container.
 *
 * @throws {PcxDecodeError} if the buffer isn't an 8-bit, single-plane,
 * RLE-encoded PCX with a trailing 256-colour palette.
 */
export function decodePcx(bytes: Uint8Array): PcxImage {
  if (bytes.length < HEADER_SIZE + PALETTE_BLOCK_SIZE) {
    throw new PcxDecodeError(
      `too small to be a PCX image: ${bytes.length} bytes`
    );
  }

  if (bytes[0] !== MANUFACTURER_ZSOFT) {
    throw new PcxDecodeError(
      `not a PCX image: expected manufacturer byte 0x0a, got 0x${bytes[0].toString(16)}`
    );
  }

  const encoding = bytes[2];
  if (encoding !== ENCODING_RLE) {
    throw new PcxDecodeError(
      `unsupported PCX encoding ${encoding}, only RLE (1) is supported`
    );
  }

  const bitsPerPixel = bytes[3];
  const planes = bytes[65];
  if (bitsPerPixel !== 8 || planes !== 1) {
    throw new PcxDecodeError(
      `unsupported PCX pixel format: ${bitsPerPixel} bits per pixel across ${planes} plane(s), only 8bpp/1 plane is supported`
    );
  }

  const xMin = readU16(bytes, 4);
  const yMin = readU16(bytes, 6);
  const xMax = readU16(bytes, 8);
  const yMax = readU16(bytes, 10);
  // PCX stores an inclusive window rather than a width/height pair.
  const width = xMax - xMin + 1;
  const height = yMax - yMin + 1;
  if (width <= 0 || height <= 0) {
    throw new PcxDecodeError(
      `invalid PCX image window: ${xMin},${yMin}..${xMax},${yMax}`
    );
  }

  // Scanlines are stored padded out to this many bytes, which can exceed
  // the image width; the padding is decoded and then discarded.
  const bytesPerLine = readU16(bytes, 66);
  if (bytesPerLine < width) {
    throw new PcxDecodeError(
      `invalid PCX scanline stride ${bytesPerLine} for width ${width}`
    );
  }

  const paletteOffset = bytes.length - PALETTE_BLOCK_SIZE;
  if (bytes[paletteOffset] !== PALETTE_MARKER) {
    throw new PcxDecodeError(
      'missing the trailing 256-colour palette marker (0x0c); only 8-bit palettised PCX files are supported'
    );
  }
  const palette = bytes.slice(paletteOffset + 1, bytes.length);

  const indices = new Uint8Array(width * height);
  let read = HEADER_SIZE;
  let x = 0;
  let y = 0;

  while (y < height) {
    if (read >= paletteOffset) {
      throw new PcxDecodeError(
        `pixel data ended early: decoded ${y} of ${height} scanlines`
      );
    }

    let value = bytes[read++];
    let count = 1;
    if ((value & RUN_MASK) === RUN_MASK) {
      count = value & ~RUN_MASK;
      if (read >= paletteOffset) {
        throw new PcxDecodeError(
          'pixel data ended on an incomplete run-length packet'
        );
      }
      value = bytes[read++];
    }

    for (let i = 0; i < count; i++) {
      // Bytes past the image width are scanline padding: decoded to keep
      // the stream in step, but not kept.
      if (x < width) {
        indices[y * width + x] = value;
      }
      x++;
      if (x >= bytesPerLine) {
        x = 0;
        y++;
        if (y >= height) {
          break;
        }
      }
    }
  }

  return { width, height, indices, palette };
}
