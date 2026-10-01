import { describe, expect, it } from 'vitest';
import {
  parseUnitManifest,
  unitManifestPath,
  UNIT_ATLAS_PATH,
  validateUnitManifest,
} from './unit-manifest';

const valid = () => ({
  frameSize: [32, 32],
  anchor: [0.5, 0.75],
  teams: ['blue', 'red'],
  actions: {
    idle: { frames: 1, fps: 0, loop: false },
    move: { frames: 8, fps: 10, loop: true },
    attack: { frames: 10, fps: 12, loop: false, hitFrame: 7 },
    dead: { frames: 6, fps: 8, loop: false, holdLast: true },
  },
});

describe('validateUnitManifest', () => {
  it('accepts a valid manifest including a single-frame idle', () => {
    expect(validateUnitManifest(valid())).toEqual([]);
    expect(parseUnitManifest(valid()).actions.idle?.frames).toBe(1);
  });

  it('accepts a neutral unit that omits actions', () => {
    const m = {
      ...valid(),
      teams: ['neutral'],
      actions: { idle: { frames: 1, fps: 0, loop: false } },
    };
    expect(validateUnitManifest(m)).toEqual([]);
  });

  it('accepts an attack without hitFrame', () => {
    const m = valid();
    delete (m.actions.attack as { hitFrame?: number }).hitFrame;
    expect(validateUnitManifest(m)).toEqual([]);
  });

  it('rejects missing and unknown actions', () => {
    expect(validateUnitManifest({ ...valid(), actions: {} })).not.toEqual([]);
    expect(
      validateUnitManifest({ ...valid(), actions: undefined })
    ).not.toEqual([]);
    const m = valid();
    (m.actions as Record<string, unknown>).dance = {
      frames: 1,
      fps: 1,
      loop: true,
    };
    expect(validateUnitManifest(m).join()).toContain('unknown action');
  });

  it('rejects bad frame sizes', () => {
    for (const frameSize of [[0, 32], [32], [32.5, 32], 'big', [-1, 4]]) {
      expect(validateUnitManifest({ ...valid(), frameSize })).not.toEqual([]);
    }
  });

  it('rejects unknown teams', () => {
    expect(
      validateUnitManifest({ ...valid(), teams: ['blue', 'green'] }).join()
    ).toContain('unknown team');
    expect(validateUnitManifest({ ...valid(), teams: [] })).not.toEqual([]);
    expect(
      validateUnitManifest({ ...valid(), teams: ['neutral', 'red'] })
    ).not.toEqual([]);
  });

  it('rejects a hitFrame outside the attack frame range', () => {
    for (const hitFrame of [10, 11, -1, 1.5]) {
      const m = valid();
      m.actions.attack.hitFrame = hitFrame;
      expect(validateUnitManifest(m)).not.toEqual([]);
    }
    const m = valid();
    m.actions.attack.hitFrame = 9;
    expect(validateUnitManifest(m)).toEqual([]);
  });

  it('rejects hitFrame on non-attack actions and bad fields', () => {
    const m = valid();
    (m.actions.move as Record<string, unknown>).hitFrame = 1;
    expect(validateUnitManifest(m)).not.toEqual([]);
    const n = valid();
    n.actions.move.frames = 0;
    expect(validateUnitManifest(n)).not.toEqual([]);
    expect(() => parseUnitManifest(null)).toThrow(/Invalid unit manifest/);
  });

  it('rejects a looping dead animation', () => {
    const m = valid();
    m.actions.dead.loop = true;
    expect(validateUnitManifest(m)).toEqual([
      'actions.dead.loop must be false',
    ]);
  });

  it('derives the manifest path from the unit type', () => {
    expect(unitManifestPath('knight')).toBe('/assets/units/knight.json');
  });

  it('keeps every unit in one shared atlas', () => {
    expect(UNIT_ATLAS_PATH).toBe('/assets/units.json');
  });

  it('accepts a manifest pointing at the atlas and rejects an empty atlas', () => {
    const base = {
      frameSize: [32, 32],
      anchor: [0.5, 0.5],
      teams: ['red'],
      actions: { idle: { frames: 1, fps: 0, loop: false } },
    };
    expect(validateUnitManifest({ ...base, atlas: UNIT_ATLAS_PATH })).toEqual(
      []
    );
    expect(validateUnitManifest({ ...base, atlas: '' })).toEqual([
      'atlas must be a non-empty string',
    ]);
  });
});
