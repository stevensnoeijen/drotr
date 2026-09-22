import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { hasCdFile, readCdFile, cdPath } from '~/test/cd-assets';

import { decodePcx } from '~/lib/art/pcx';
import { toRgba, TEAL_COLOR_KEY } from '~/lib/art/rgba';
import { extractTileRgba, tileCount, tileRect } from '~/lib/art/atlas';
import { GOLDEN_TILE_HASHES } from './battle-art-golden-hashes';

/**
 * Golden tests against the real `ART/BATTLE.ART`.
 *
 * The file is original game data and is not committed, so these skip
 * wherever it isn't present (CI included) — the format-level behaviour they
 * back up is covered unconditionally by the synthetic-fixture specs
 * alongside them. The expected hashes are recorded in
 * `battle-art-golden-hashes.ts` rather than any pixels, so nothing here
 * reproduces the original artwork.
 */
const BATTLE_ART = 'ART/BATTLE.ART';
const available = hasCdFile(BATTLE_ART);

function sha256(bytes: ArrayLike<number>): string {
  return createHash('sha256').update(Uint8Array.from(bytes)).digest('hex');
}

describe.skipIf(!available)('BATTLE.ART', () => {
  const image = available
    ? decodePcx(readCdFile(BATTLE_ART))
    : // Unreachable while skipped; keeps the binding typed.
      (undefined as never);

  it('decodes to the full 640x9367 sheet', () => {
    expect(image.width).toEqual(640);
    expect(image.height).toEqual(9367);
    expect(image.indices).toHaveLength(640 * 9367);
  });

  it('reproduces the sheet palette indices exactly', () => {
    expect(sha256(image.indices)).toEqual(
      'bd75c57cf7748ac0af862f593c753b877ecdfd74a1cfa26b357711bd0492e61b'
    );
  });

  it('reproduces the 256-colour palette exactly', () => {
    expect(sha256(image.palette)).toEqual(
      '36cff1d2fd7c764aa5dfac37ea61951d67d73a6f548c883a1ada2bf0b1ed68df'
    );
  });

  it('holds the teal colour key in exactly one palette slot', () => {
    const keyed: number[] = [];
    for (let i = 0; i < 256; i++) {
      if (
        image.palette[i * 3] === TEAL_COLOR_KEY.r &&
        image.palette[i * 3 + 1] === TEAL_COLOR_KEY.g &&
        image.palette[i * 3 + 2] === TEAL_COLOR_KEY.b
      ) {
        keyed.push(i);
      }
    }

    expect(keyed).toEqual([37]);
  });

  it('holds at least 1472 complete tiles', () => {
    // The county maps reference tile indices up to 1471.
    expect(tileCount(image.width, image.height)).toBeGreaterThanOrEqual(1472);
  });

  it('holds 3744 complete tiles on the measured grid', () => {
    expect(tileCount(image.width, image.height)).toEqual(3744);
  });

  it('contains tiles 1460 to 1471 in full', () => {
    // These are the indices a 64px grid reading of the sheet cannot reach,
    // and the reason the earlier PNG conversion looked truncated.
    for (let index = 1460; index <= 1471; index++) {
      const rect = tileRect(index, image.width);

      expect(rect.y + rect.height).toBeLessThanOrEqual(image.height);
      expect(extractTileRgba(image, index)).toHaveLength(40 * 40 * 4);
    }
  });

  it.each(Object.entries(GOLDEN_TILE_HASHES))(
    'decodes tile %s to its recorded pixels',
    (index, expected) => {
      expect(sha256(extractTileRgba(image, Number(index)))).toEqual(expected);
    }
  );

  it('decodes the whole sheet to its recorded RGBA', () => {
    expect(sha256(toRgba(image))).toEqual(
      'f8cd456d0ad5deac961fcd2d443b728f747c7f4b274201e6ebc4367da9aa9591'
    );
  });

  it('leaves no teal colour-key pixel opaque', () => {
    const rgba = toRgba(image);
    let opaqueKeyPixels = 0;
    let transparentPixels = 0;

    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] === 0) {
        transparentPixels++;
        continue;
      }
      if (
        rgba[i] === TEAL_COLOR_KEY.r &&
        rgba[i + 1] === TEAL_COLOR_KEY.g &&
        rgba[i + 2] === TEAL_COLOR_KEY.b
      ) {
        opaqueKeyPixels++;
      }
    }

    expect(opaqueKeyPixels).toEqual(0);
    // Guards against the inverse failure: a conversion that made the whole
    // sheet transparent would also report zero opaque key pixels.
    expect(transparentPixels).toEqual(2679365);
  });
});

describe.skipIf(!available)('the other .ART files', () => {
  // The container format generalises across the CD's art files, so the one
  // decoder covers the menu/council/loading screens too.
  const sheets: Record<string, { width: number; height: number }> = {
    'ART/COUNCIL.ART': { width: 640, height: 3594 },
    'ART/CREDITS.ART': { width: 640, height: 524 },
    'ART/DEMO.ART': { width: 640, height: 480 },
    'ART/LOADING.ART': { width: 640, height: 480 },
    'ART/MENU.ART': { width: 640, height: 1909 },
  };

  it.each(Object.entries(sheets))('decodes %s', (file, size) => {
    if (!hasCdFile(file)) {
      // Only BATTLE.ART gates the suite; note and move on if a sibling is
      // missing from this particular copy of the CD data.
      console.warn(`skipping ${cdPath(file)}: not present`);
      return;
    }

    const decoded = decodePcx(readCdFile(file));

    expect(decoded.width).toEqual(size.width);
    expect(decoded.height).toEqual(size.height);
    expect(decoded.indices).toHaveLength(size.width * size.height);
    expect(decoded.palette).toHaveLength(768);
  });
});
