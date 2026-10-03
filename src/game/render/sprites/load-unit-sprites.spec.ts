import { Assets, Spritesheet, Texture, TextureSource } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  committedAtlasData,
  committedManifest,
  readPublicJson,
} from '~/test/unit-sprites-fixture';
import { DIRECTIONS } from './animation-key';
import { loadUnitSprites, publicUrl, unitSpritesFromAtlas, type UnitSpriteSources } from './load-unit-sprites';
import { UNIT_ATLAS_PATH, actionDirections, unitManifestPath } from './unit-manifest';
import { SPRITE_UNIT_TYPES } from './unit-sprites';

/** The committed atlas, cut from its own texture source so tests can inspect it. */
function atlas(): Spritesheet {
  const data = committedAtlasData();
  const source = new TextureSource({ width: data.meta.size!.w, height: data.meta.size!.h });
  const sheet = new Spritesheet(new Texture({ source }), data);
  sheet.parseSync();
  return sheet;
}

/** Sources serving the committed atlas and manifests, optionally tampered with. */
function sources(overrides: Partial<UnitSpriteSources> = {}): UnitSpriteSources {
  return {
    loadAtlas: vi.fn(async () => atlas()),
    fetchJson: vi.fn(async (url: string) => readPublicJson(url)),
    ...overrides,
  };
}

describe('loadUnitSprites', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns animations and the manifest for every sprite unit type', async () => {
    const src = sources();
    const sprites = await loadUnitSprites(src);

    expect([...sprites.keys()]).toEqual([...SPRITE_UNIT_TYPES]);
    for (const unit of SPRITE_UNIT_TYPES) {
      const data = sprites.get(unit)!;
      expect(data.manifest).toEqual(committedManifest(unit));
      // Every action the manifest declares, in its first team and facing
      // (a bolt has only a neutral move).
      const team = data.manifest.teams[0];
      for (const [action, declared] of Object.entries(data.manifest.actions)) {
        const direction = actionDirections(declared)[0];
        expect(data.animations[`${unit}.${team}.${action}.${direction}`]).toHaveLength(
          declared.frames
        );
      }
    }
    expect(src.loadAtlas).toHaveBeenCalledWith(publicUrl(UNIT_ATLAS_PATH));
    for (const unit of SPRITE_UNIT_TYPES) {
      expect(src.fetchJson).toHaveBeenCalledWith(publicUrl(unitManifestPath(unit)));
    }
  });

  it('rejects naming the atlas when it fails to load', async () => {
    const src = sources({ loadAtlas: () => Promise.reject(new Error('network down')) });

    await expect(loadUnitSprites(src)).rejects.toThrow(
      `Couldn't load the unit atlas (${publicUrl(UNIT_ATLAS_PATH)}): network down`
    );
  });

  it('rejects naming the manifest when its fetch fails', async () => {
    const src = sources({ fetchJson: () => Promise.reject(new TypeError('Failed to fetch')) });

    await expect(loadUnitSprites(src)).rejects.toThrow(
      `Couldn't load the swordsmen manifest (${publicUrl(unitManifestPath('swordsmen'))}): ` +
        'Failed to fetch'
    );
  });

  it('rejects with every problem of an invalid manifest', async () => {
    const src = sources({
      fetchJson: async () => ({ ...committedManifest('swordsmen'), anchor: [2, 0], teams: [] }),
    });

    await expect(loadUnitSprites(src)).rejects.toThrow(
      /swordsmen manifest .*Invalid unit manifest: anchor must be .*; teams must be a non-empty array/
    );
  });

  it('rejects when an animation the manifest declares is missing from the atlas', async () => {
    const src = sources({
      loadAtlas: async () => {
        const sheet = atlas();
        delete sheet.animations['swordsmen.red.dead.sw'];
        return sheet;
      },
    });

    await expect(loadUnitSprites(src)).rejects.toThrow(
      "The unit atlas doesn't match the swordsmen manifest: swordsmen.red.dead.sw is missing"
    );
  });

  it('does not require frames for directions an action does not declare', async () => {
    // The juggernaut attacks north only; its other attack keys are absent.
    const sheet = atlas();
    expect(sheet.animations['juggernaut.red.attack.n']).toBeDefined();
    expect(sheet.animations['juggernaut.red.attack.s']).toBeUndefined();
    expect(() =>
      unitSpritesFromAtlas(sheet.animations, new Map([['juggernaut', committedManifest('juggernaut')]]))
    ).not.toThrow();
  });

  it('rejects when an animation has fewer frames than the manifest declares', async () => {
    const src = sources({
      loadAtlas: async () => {
        const sheet = atlas();
        for (const direction of DIRECTIONS) {
          const key = `swordsmen.blue.move.${direction}`;
          sheet.animations[key] = sheet.animations[key].slice(0, 5);
        }
        return sheet;
      },
    });

    await expect(loadUnitSprites(src)).rejects.toThrow(
      'swordsmen.blue.move.n has 5 frames, expected 8; ' +
        'swordsmen.blue.move.ne has 5 frames, expected 8; ' +
        'swordsmen.blue.move.e has 5 frames, expected 8 (and 5 more)'
    );
  });

  describe('browser sources', () => {
    it('loads the atlas through Assets with nearest-neighbour scaling', async () => {
      const sheet = atlas();
      const load = vi.spyOn(Assets, 'load').mockResolvedValue(sheet as never);
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => Response.json(readPublicJson(url)))
      );

      const sprites = await loadUnitSprites();

      expect(load).toHaveBeenCalledWith(publicUrl(UNIT_ATLAS_PATH));
      expect(sheet.textureSource.scaleMode).toBe('nearest');
      expect(sprites.get('swordsmen')?.animations).toBe(sheet.animations);
    });

    it('rejects on a non-OK manifest response', async () => {
      vi.spyOn(Assets, 'load').mockResolvedValue(atlas() as never);
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('nope', { status: 404, statusText: 'Not Found' }))
      );

      await expect(loadUnitSprites()).rejects.toThrow(
        `Couldn't load the swordsmen manifest (${publicUrl(unitManifestPath('swordsmen'))}): ` +
          '404 Not Found'
      );
    });

    it('rejects when the atlas does not load as a spritesheet', async () => {
      vi.spyOn(Assets, 'load').mockResolvedValue({ frames: {} } as never);
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => Response.json(readPublicJson(url)))
      );

      await expect(loadUnitSprites()).rejects.toThrow(/unit atlas .*not a spritesheet/);
    });
  });
});
