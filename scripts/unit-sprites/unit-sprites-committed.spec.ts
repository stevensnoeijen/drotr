import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { units as unitDefinitions, type UnitType } from '~/game/data/units';
import {
  DIRECTIONS,
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
  // Pinned when the cannon joined the atlas (the bolt's when it did); they
  // only change if a unit's frame map or the packer's pixel output does.
  it.each([
    ['swordsmen', '2f608953352bed924ee6ccf5548002dddb1c2701'],
    ['crossbowsoldier', '48264938f23e1bf0a3603ca75e717f55690ed5be'],
    ['knight', 'ac648223925c710a9f981234d40f0b356dd4eba9'],
    ['juggernaut', '186006382b1f75e1841d5520daba81eeaf2f1b13'],
    ['catapult', '4134a922e9f4f4b18efd752e9093ab7363e67271'],
    ['cannon', '78e7b786d65089a7a350f924f92d144c0658d58b'],
    ['bolt', '8076f4fb3f8872a8ba41863f97721ce34612899d'],
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

describe.each(['swordsmen', 'crossbowsoldier', 'knight', 'juggernaut', 'catapult'] as const)('committed %s timing', (unit) => {
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

describe('crossbowsoldier attack release time', () => {
  it('matches the committed attack animation\'s release frame', () => {
    const { actions } = parseUnitManifest(readJson(unitManifestPath('crossbowsoldier')));
    const { hitFrame, fps } = actions.attack!;
    expect(unitDefinitions.crossbowsoldier.attackReleaseTime).toBeCloseTo(hitFrame! / fps, 6);
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

describe('committed catapult', () => {
  const manifest = parseUnitManifest(readJson(unitManifestPath('catapult')));
  const animations = sheet.animations as Record<string, string[]>;

  it('is team-neutral, with a single colourway', () => {
    expect(manifest.teams).toEqual(['neutral']);
  });

  it('resolves every declared animation to a non-empty frame list', () => {
    for (const [action, declared] of Object.entries(manifest.actions)) {
      for (const direction of actionDirections(declared)) {
        const names = animations[`catapult.neutral.${action}.${direction}`];
        expect(names?.length, `${action}.${direction}`).toBeGreaterThan(0);
      }
    }
  });

  it('declares all four actions in all eight directions', () => {
    expect(Object.keys(manifest.actions)).toEqual(['idle', 'move', 'attack', 'dead']);
    for (const declared of Object.values(manifest.actions)) {
      expect(declared.directions).toBeUndefined();
    }
  });

  it('has no move cycle: move and idle show the ready frame of the swing', () => {
    expect(manifest.actions.move!.frames).toBe(1);
    const rect = (key: string) => {
      expect(animations[key], key).toHaveLength(1);
      return sheet.frames[animations[key][0]].frame;
    };
    for (const direction of ['n', 'e', 's', 'w'] as const) {
      const ready = sheet.frames[animations[`catapult.neutral.attack.${direction}`][0]].frame;
      expect(rect(`catapult.neutral.idle.${direction}`)).toEqual(ready);
      expect(rect(`catapult.neutral.move.${direction}`)).toEqual(ready);
    }
  });

  it('holds its single debris frame once dead', () => {
    expect(manifest.actions.dead).toMatchObject({ frames: 1, fps: 2, loop: false, holdLast: true });
  });
});

describe('committed cannon', () => {
  const manifest = parseUnitManifest(readJson(unitManifestPath('cannon')));
  const animations = sheet.animations as Record<string, string[]>;

  it('is team-neutral, with a single colourway', () => {
    expect(manifest.teams).toEqual(['neutral']);
  });

  it('declares all four actions in all eight directions', () => {
    expect(Object.keys(manifest.actions)).toEqual(['idle', 'move', 'attack', 'dead']);
    for (const declared of Object.values(manifest.actions)) {
      expect(declared.directions).toBeUndefined();
    }
  });

  it('resolves every declared animation to a non-empty frame list', () => {
    for (const [action, declared] of Object.entries(manifest.actions)) {
      for (const direction of actionDirections(declared)) {
        const names = animations[`cannon.neutral.${action}.${direction}`];
        expect(names?.length, `${action}.${direction}`).toBeGreaterThan(0);
      }
    }
  });

  it('plays the idle frame for move and attack, adding no frames to the atlas', () => {
    const rect = (key: string) => {
      expect(animations[key], key).toHaveLength(1);
      return sheet.frames[animations[key][0]].frame;
    };
    const rects = new Set<string>();
    for (const direction of DIRECTIONS) {
      const idle = rect(`cannon.neutral.idle.${direction}`);
      expect(rect(`cannon.neutral.move.${direction}`)).toEqual(idle);
      expect(rect(`cannon.neutral.attack.${direction}`)).toEqual(idle);
      rects.add(JSON.stringify(idle));
      rects.add(JSON.stringify(rect(`cannon.neutral.dead.${direction}`)));
    }
    // Eight idle rects and eight wreck rects back all 32 animations.
    expect(rects.size).toBe(16);
  });

  it('makes move and attack single, static frames, like idle', () => {
    for (const action of ['idle', 'move'] as const) {
      expect(manifest.actions[action]).toEqual({ frames: 1, fps: 0, loop: false });
    }
    expect(manifest.actions.attack).toEqual({ frames: 1, fps: 0, loop: false, hitFrame: 0 });
  });

  it('holds its single wreck frame once dead', () => {
    expect(manifest.actions.idle).toMatchObject({ frames: 1, fps: 0, loop: false });
    expect(manifest.actions.dead).toMatchObject({ frames: 1, fps: 2, loop: false, holdLast: true });
  });
});

describe('committed bolt', () => {
  const manifest = parseUnitManifest(readJson(unitManifestPath('bolt')));
  const animations = sheet.animations as Record<string, string[]>;

  it('is team-neutral, with a single colourway', () => {
    expect(manifest.teams).toEqual(['neutral']);
  });

  it('only flies: a single still move frame in all eight directions', () => {
    expect(manifest.actions).toEqual({ move: { frames: 1, fps: 0, loop: false } });
    expect(manifest.frameSize).toEqual([14, 14]);
    expect(manifest.anchor).toEqual([0.5, 0.5]);
  });

  it.each(DIRECTIONS)('resolves bolt.neutral.move.%s to exactly one frame of its own', (direction) => {
    const names = animations[`bolt.neutral.move.${direction}`];
    expect(names).toHaveLength(1);
    const { frame } = sheet.frames[names[0]];
    expect([frame.w, frame.h]).toEqual([14, 14]);
    // Every direction has a frame of its own, not one shared with another.
    const others = DIRECTIONS.filter((d) => d !== direction).map(
      (d) => sheet.frames[animations[`bolt.neutral.move.${d}`][0]].frame
    );
    expect(others).not.toContainEqual(frame);
  });
});
