import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import type { UnitType } from '~/game/data/units';
import {
  animationKey,
  frameName,
} from '~/game/render/sprites/animation-key';
import {
  UNIT_ATLAS_PATH,
  actionDirections,
  parseUnitManifest,
  unitManifestPath,
  validateUnitManifest,
} from '~/game/render/sprites/unit-manifest';
import { MAX_SWING_SECONDS } from '~/game/systems/combat-system';
import { DEATH_REMOVAL_DELAY_SECONDS } from '~/game/systems/death-system';
import { TEAL_COLOR_KEY } from '~/lib/art/rgba';

import { FRAME_MAPS } from './frame-maps';
import type { SheetJson } from './unit-sprites';

/**
 * Tests against the **committed** shared unit atlas and per-unit manifests
 * in `public/assets/`. They need no `.cd/` data.
 */

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const read = (publicPath: string) =>
  fs.readFileSync(path.join(PUBLIC_DIR, publicPath));
const readJson = (publicPath: string): unknown =>
  JSON.parse(read(publicPath).toString('utf8'));

const units = Object.keys(FRAME_MAPS) as UnitType[];
const pngBytes = read('assets/units.png');
const png = PNG.sync.read(pngBytes);
const sheet = readJson(UNIT_ATLAS_PATH) as SheetJson;

describe('committed unit atlas', () => {
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

  it('points the sheet at its image, at the image size', () => {
    expect(sheet.meta.image).toBe('units.png');
    expect(sheet.meta.size).toEqual({ w: png.width, h: png.height });
  });

  it('holds only animations of units with a frame map', () => {
    for (const key of Object.keys(sheet.animations)) {
      expect(units).toContain(key.split('.')[0]);
    }
  });
});

/**
 * SHA-1 over a unit's animation keys and the pixels of every frame, in key
 * order. Independent of where the packer happened to place the frames, so a
 * unit added to the atlas moves other units' rects without changing this.
 */
function unitPixelHash(unit: UnitType): string {
  const hash = createHash('sha1');
  const keys = Object.keys(sheet.animations)
    .filter((key) => key.startsWith(`${unit}.`))
    .sort();
  for (const key of keys) {
    hash.update(key);
    for (const name of sheet.animations[key as keyof typeof sheet.animations]) {
      const { x, y, w, h } = sheet.frames[name].frame;
      for (let row = 0; row < h; row++) {
        const start = ((y + row) * png.width + x) * 4;
        hash.update(png.data.subarray(start, start + w * 4));
      }
    }
  }
  return hash.digest('hex');
}

describe('committed unit pixels', () => {
  // Pinned when the juggernaut joined the atlas; they only change if a
  // unit's frame map or the packer's pixel output does.
  it.each([
    ['swordsmen', '2f608953352bed924ee6ccf5548002dddb1c2701'],
    ['crossbowsoldier', '48264938f23e1bf0a3603ca75e717f55690ed5be'],
    ['knight', 'ac648223925c710a9f981234d40f0b356dd4eba9'],
  ] as const)('leaves the %s frames unchanged', (unit, hash) => {
    expect(unitPixelHash(unit)).toBe(hash);
  });
});

describe.each(units)('committed %s manifest', (unit) => {
  const manifest = readJson(unitManifestPath(unit));

  it('validates against the contract and points at the shared atlas', () => {
    expect(validateUnitManifest(manifest)).toEqual([]);
    expect(parseUnitManifest(manifest).atlas).toBe(UNIT_ATLAS_PATH);
  });

  it('resolves every animation to an ordered, same-size frame list', () => {
    const { teams, actions, frameSize } = parseUnitManifest(manifest);
    let expected = 0;
    for (const team of teams) {
      for (const [action, declared] of Object.entries(actions)) {
        const count = declared.frames;
        for (const direction of actionDirections(declared)) {
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
    const own = Object.keys(sheet.animations).filter((key) =>
      key.startsWith(`${unit}.`)
    );
    expect(own).toHaveLength(expected);
  });
});

describe.each(['swordsmen', 'crossbowsoldier', 'knight', 'juggernaut'] as const)('committed %s timing', (unit) => {
  const { actions } = parseUnitManifest(readJson(unitManifestPath(unit)));
  const seconds = (action: 'attack' | 'dead') =>
    actions[action]!.frames / actions[action]!.fps;

  it('plays the attack within one swing and lands the hit on a real frame', () => {
    expect(seconds('attack')).toBeLessThanOrEqual(MAX_SWING_SECONDS);
    expect(actions.attack!.hitFrame).toBeLessThan(actions.attack!.frames);
  });

  it('finishes dying and holds its last frame before the corpse is removed', () => {
    expect(actions.dead!.holdLast).toBe(true);
    expect(seconds('dead')).toBeLessThan(DEATH_REMOVAL_DELAY_SECONDS);
  });
});

describe('committed juggernaut attack', () => {
  const { actions } = parseUnitManifest(readJson(unitManifestPath('juggernaut')));

  it('has frames for north only', () => {
    expect(actions.attack!.directions).toEqual(['n']);
    for (const team of ['blue', 'red']) {
      expect((sheet.animations as Record<string, string[]>)[`juggernaut.${team}.attack.n`]).toHaveLength(
        actions.attack!.frames
      );
      expect((sheet.animations as Record<string, string[]>)[`juggernaut.${team}.attack.e`]).toBeUndefined();
    }
  });

  it('leaves its other actions in all eight directions', () => {
    for (const action of ['idle', 'move', 'dead'] as const) {
      expect(actions[action]!.directions).toBeUndefined();
    }
  });
});
