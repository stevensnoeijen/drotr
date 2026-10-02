import fs from 'node:fs';
import path from 'node:path';

import { Spritesheet, Texture, type SpritesheetData } from 'pixi.js';

import type { UnitType } from '~/game/data/units';
import { unitSpritesFromAtlas } from '~/game/render/sprites/load-unit-sprites';
import {
  UNIT_ATLAS_PATH,
  parseUnitManifest,
  unitManifestPath,
  type UnitManifest,
} from '~/game/render/sprites/unit-manifest';
import { SPRITE_UNIT_TYPES, type UnitSprites } from '~/game/render/sprites/unit-sprites';

const PUBLIC_DIR = path.resolve(import.meta.dirname, '../../public');

/** Reads a committed JSON file from `public/` by its root-relative URL path. */
export function readPublicJson(urlPath: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, urlPath), 'utf8'));
}

/** The committed shared unit atlas data (`public/assets/units.json`). */
export function committedAtlasData(): SpritesheetData {
  return readPublicJson(UNIT_ATLAS_PATH) as SpritesheetData;
}

/** A committed unit manifest (`public/assets/units/<unit>.json`), validated. */
export function committedManifest(unit: UnitType): UnitManifest {
  return parseUnitManifest(readPublicJson(unitManifestPath(unit)));
}

/**
 * The committed shared unit atlas parsed headlessly: every frame is cut from
 * `Texture.WHITE` (no image is decoded or fetched), which is all the
 * renderer needs to build and swap `AnimatedSprite` textures in jsdom.
 */
export function committedAtlas(): Spritesheet {
  const sheet = new Spritesheet(Texture.WHITE, committedAtlasData());
  sheet.parseSync();
  return sheet;
}

/**
 * Sprite data for every `SPRITE_UNIT_TYPES` type, built from the committed
 * atlas and manifests exactly as the game loads it — for specs that build a
 * `RenderSystem` with sprite units in it.
 */
export function committedUnitSprites(sheet: Spritesheet = committedAtlas()): UnitSprites {
  return unitSpritesFromAtlas(
    sheet.animations,
    new Map(SPRITE_UNIT_TYPES.map((unit) => [unit, committedManifest(unit)]))
  );
}
