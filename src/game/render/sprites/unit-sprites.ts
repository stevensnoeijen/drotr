import type { Texture } from 'pixi.js';

import type { UnitType } from '~/game/data/units';
import type { UnitManifest } from './unit-manifest';

/**
 * The unit types the game renders as animated sprites from the shared unit
 * atlas. This is the single place that decides sprite vs. shape: every
 * other unit type (and every entity without a unit type, such as a fired
 * projectile) keeps its primitive shape. There is deliberately no other
 * switch — no URL or debug toggle, no per-entity flag, and no fallback to
 * the shape when a sprite unit's frames are missing. A unit is moved over by
 * packing its frames into the atlas and adding its type here.
 */
export const SPRITE_UNIT_TYPES: readonly UnitType[] = ['swordsmen'];

/** Whether entities of `type` are drawn as sprites (see {@link SPRITE_UNIT_TYPES}). */
export function isSpriteUnitType(type: UnitType | undefined): type is UnitType {
  return type !== undefined && SPRITE_UNIT_TYPES.includes(type);
}

/** Everything the renderer needs to animate one sprite unit type. */
export interface UnitSpriteData {
  /**
   * The unit's animations, keyed by `AnimationKey` — the shared atlas's own
   * `animations` record. The textures belong to Pixi's `Assets` cache and
   * are shared by every sprite (and by `#/unit-preview`), so they must
   * never be destroyed by whoever uses them.
   */
  animations: Readonly<Record<string, Texture[]>>;
  manifest: UnitManifest;
}

/** Loaded sprite data for every type in {@link SPRITE_UNIT_TYPES}. */
export type UnitSprites = ReadonlyMap<UnitType, UnitSpriteData>;

/** Pixi's ticker runs at 60 frames per second by default. */
const TICKER_FPS = 60;

/** Converts a manifest `fps` into an `AnimatedSprite.animationSpeed`. */
export function animationSpeed(fps: number): number {
  return fps / TICKER_FPS;
}
