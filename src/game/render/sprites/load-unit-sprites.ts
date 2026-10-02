import { Assets, type Spritesheet, type Texture } from 'pixi.js';

import type { UnitType } from '~/game/data/units';
import { animationKey, DIRECTIONS, UNIT_ACTIONS } from './animation-key';
import {
  UNIT_ATLAS_PATH,
  parseUnitManifest,
  unitManifestPath,
  type UnitManifest,
} from './unit-manifest';
import { SPRITE_UNIT_TYPES, type UnitSpriteData, type UnitSprites } from './unit-sprites';

/** Resolves a root-relative public asset path against the app's base URL. */
export function publicUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

/** Where {@link loadUnitSprites} gets its data from; injectable for tests. */
export interface UnitSpriteSources {
  /** Loads the shared unit atlas as a parsed spritesheet. */
  loadAtlas(url: string): Promise<Pick<Spritesheet, 'animations'>>;
  /** Fetches a JSON document, rejecting on a network error or non-OK response. */
  fetchJson(url: string): Promise<unknown>;
}

const browserSources: UnitSpriteSources = {
  async loadAtlas(url) {
    const sheet = await Assets.load<Spritesheet>(url);
    if (!sheet?.animations || !sheet.textureSource) {
      throw new Error('not a spritesheet');
    }
    // Pixel art: keep frames crisp at any zoom, like the terrain tiles.
    sheet.textureSource.scaleMode = 'nearest';
    return sheet;
  },
  async fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`.trim());
    }
    return response.json();
  },
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Runs `load`, prefixing any failure with what was being loaded. */
async function loading<T>(what: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    throw new Error(`Couldn't load ${what}: ${messageOf(error)}`, { cause: error });
  }
}

/** How many individual problems an atlas/manifest mismatch error lists. */
const MAX_LISTED_PROBLEMS = 3;

/**
 * Pairs each manifest with the atlas's animations, checking that every
 * team × action × direction the manifest declares resolves to an atlas
 * animation with exactly the manifest's `frames` textures. Throws a
 * readable error listing the first few mismatches otherwise, so a stale or
 * partial atlas fails at load time rather than mid-game.
 */
export function unitSpritesFromAtlas(
  animations: Readonly<Record<string, Texture[]>> | undefined,
  manifests: ReadonlyMap<UnitType, UnitManifest>
): UnitSprites {
  const sprites = new Map<UnitType, UnitSpriteData>();
  for (const [unit, manifest] of manifests) {
    const problems: string[] = [];
    for (const team of manifest.teams) {
      for (const action of UNIT_ACTIONS) {
        const declared = manifest.actions[action];
        if (!declared) continue;
        for (const direction of DIRECTIONS) {
          const key = animationKey(unit, team, action, direction);
          const textures = animations?.[key];
          if (!textures) {
            problems.push(`${key} is missing`);
          } else if (textures.length !== declared.frames) {
            problems.push(`${key} has ${textures.length} frames, expected ${declared.frames}`);
          }
        }
      }
    }
    if (problems.length > 0) {
      const listed = problems.slice(0, MAX_LISTED_PROBLEMS).join('; ');
      const more =
        problems.length > MAX_LISTED_PROBLEMS
          ? ` (and ${problems.length - MAX_LISTED_PROBLEMS} more)`
          : '';
      throw new Error(`The unit atlas doesn't match the ${unit} manifest: ${listed}${more}`);
    }
    sprites.set(unit, { animations: animations ?? {}, manifest });
  }
  return sprites;
}

/**
 * Loads the shared unit atlas ({@link UNIT_ATLAS_PATH}) and the manifest of
 * every type in `types` ({@link SPRITE_UNIT_TYPES} by default), all in
 * parallel, and checks they agree (see {@link unitSpritesFromAtlas}).
 * Rejects with a readable message naming what failed — a network error, a
 * non-OK response, an invalid manifest, or a missing or short animation.
 *
 * The atlas comes from Pixi's `Assets` cache, so loading it again (e.g. on
 * a `GameCanvas` remount) is cheap and returns the same textures; callers
 * must never destroy them.
 */
export async function loadUnitSprites(
  sources: UnitSpriteSources = browserSources,
  types: readonly UnitType[] = SPRITE_UNIT_TYPES
): Promise<UnitSprites> {
  const atlasUrl = publicUrl(UNIT_ATLAS_PATH);
  const [sheet, manifests] = await Promise.all([
    loading(`the unit atlas (${atlasUrl})`, () => sources.loadAtlas(atlasUrl)),
    Promise.all(
      types.map((unit) => {
        const url = publicUrl(unitManifestPath(unit));
        return loading(`the ${unit} manifest (${url})`, async () => {
          const manifest = parseUnitManifest(await sources.fetchJson(url));
          return [unit, manifest] as const;
        });
      })
    ),
  ]);
  return unitSpritesFromAtlas(sheet.animations, new Map(manifests));
}
