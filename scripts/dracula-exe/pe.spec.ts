import { describe, expect, it } from 'vitest';

import { buildDraculaExeBytes, FIXTURE_IMAGE_BASE } from './dracula-exe-fixture';

import { parsePe, PeError, readVa, vaToFileOffset } from './pe';

describe('parsePe', () => {
  it('reads the image base and section table', () => {
    const image = parsePe(buildDraculaExeBytes());
    expect(image.imageBase).toBe(FIXTURE_IMAGE_BASE);
    expect(image.sections).toEqual([
      {
        name: '.data',
        virtualAddress: 0x6a000,
        virtualSize: 0x25000,
        pointerToRawData: 0x400,
        sizeOfRawData: 0x25000,
      },
    ]);
  });

  it('rejects a buffer without the MZ header', () => {
    expect(() => parsePe(new Uint8Array(256))).toThrow(/MZ/);
  });

  it('rejects a buffer without the PE signature', () => {
    const bytes = buildDraculaExeBytes();
    bytes[0x80] = 0;
    expect(() => parsePe(bytes)).toThrow(PeError);
  });
});

describe('vaToFileOffset', () => {
  const image = parsePe(buildDraculaExeBytes());

  it('maps a VA through its section', () => {
    expect(vaToFileOffset(image, 0x46a000)).toBe(0x400);
    expect(vaToFileOffset(image, 0x470900)).toBe(0x400 + 0x6900);
  });

  it('rejects a range outside the stored section bytes', () => {
    expect(() => vaToFileOffset(image, 0x401000)).toThrow(PeError);
    expect(() => vaToFileOffset(image, 0x46a000 + 0x25000 - 1, 2)).toThrow(
      /not stored/
    );
  });

  it('reads bytes at a VA', () => {
    const bytes = buildDraculaExeBytes();
    bytes[0x400 + 5] = 42;
    expect(readVa(parsePe(bytes), 0x46a005, 1)).toEqual(new Uint8Array([42]));
  });
});
