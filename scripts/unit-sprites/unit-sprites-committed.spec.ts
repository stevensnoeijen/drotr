import * as fs from 'node:fs';
import * as path from 'node:path';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import {
  DIRECTIONS,
  animationKey,
  frameName,
} from '~/game/render/sprites/animation-key';
import {
  parseUnitManifest,
  validateUnitManifest,
} from '~/game/render/sprites/unit-manifest';
import { TEAL_COLOR_KEY } from '~/lib/art/rgba';
import { decodePcx } from '~/lib/art/pcx';
import { hasCdFile, readCdFile } from '~/test/cd-assets';

import { FRAME_MAPS } from './frame-maps';
import { encodeRgbaPng, packUnitSprites, type SheetJson } from './unit-sprites';

/**
 * Tests against the **committed** unit sheets in `public/assets/units/`.
 * They need no `.cd/` data, so they always run. A fresh pack from the real
 * `BATTLE.ART`, compared byte for byte, runs only where `.cd/` exists.
 */

const UNITS_DIR = path.join(process.cwd(), 'public', 'assets', 'units');
const units = Object.keys(FRAME_MAPS) as (keyof typeof FRAME_MAPS)[];

const read = (file: string) => fs.readFileSync(path.join(UNITS_DIR, file));
const readJson = (file: string): unknown =>
  JSON.parse(read(file).toString('utf8'));

describe.each(units)('committed %s sheet', (unit) => {
  const pngBytes = read(`${unit}.png`);
  const png = PNG.sync.read(pngBytes);
  const sheet = readJson(`${unit}.sheet.json`) as SheetJson;
  const manifest = readJson(`${unit}.json`);

  it('is a genuine RGBA PNG (colour type 6)', () => {
    expect(
      pngBytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ).toBe(true);
    expect(pngBytes.subarray(12, 16).toString('latin1')).toBe('IHDR');
    expect(pngBytes[24]).toBe(8); // bit depth
    expect(pngBytes[25]).toBe(6); // colour type: truecolour with alpha
  });

  it('has no teal colour-key pixels left at full alpha', () => {
    const { r, g, b } = TEAL_COLOR_KEY;
    let teal = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      if (
        png.data[i + 3] === 255 &&
        png.data[i] === r &&
        png.data[i + 1] === g &&
        png.data[i + 2] === b
      ) {
        teal++;
      }
    }
    expect(teal).toBe(0);
  });

  it('has a manifest that validates against the contract', () => {
    expect(validateUnitManifest(manifest)).toEqual([]);
  });

  it('points the sheet at its image, at the image size', () => {
    expect(sheet.meta.image).toBe(`${unit}.png`);
    expect(sheet.meta.size).toEqual({ w: png.width, h: png.height });
  });

  it('resolves every manifest animation to an ordered, same-size frame list', () => {
    const { teams, actions, frameSize } = parseUnitManifest(manifest);
    let expected = 0;
    for (const team of teams) {
      for (const [action, { frames: count }] of Object.entries(actions)) {
        for (const direction of DIRECTIONS) {
          const key = animationKey(
            unit,
            team,
            action as keyof typeof actions,
            direction
          );
          const names = sheet.animations[key];
          expect(names, key).toEqual(
            Array.from({ length: count }, (_, i) => frameName(key, i + 1))
          );
          for (const name of names) {
            const { frame } = sheet.frames[name];
            expect([frame.w, frame.h], name).toEqual(frameSize);
            expect(frame.x + frame.w).toBeLessThanOrEqual(png.width);
            expect(frame.y + frame.h).toBeLessThanOrEqual(png.height);
          }
          expected++;
        }
      }
    }
    expect(Object.keys(sheet.animations)).toHaveLength(expected);
  });

  it.runIf(hasCdFile('ART/BATTLE.ART'))(
    'matches a fresh pack of the real BATTLE.ART',
    () => {
      const image = decodePcx(readCdFile('ART/BATTLE.ART'));
      const packed = packUnitSprites(image, FRAME_MAPS[unit]!);
      expect(encodeRgbaPng(packed).equals(pngBytes)).toBe(true);
      expect(packed.sheet).toEqual(sheet);
      expect(packed.manifest).toEqual(manifest);
    }
  );
});
