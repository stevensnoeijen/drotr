import { Container, Graphics } from 'pixi.js';

import type { Health, Renderable } from '~/game/ecs/types';

/** Overall width of a unit's health bar, in world units. */
export const HEALTH_BAR_WIDTH = 24;
/** Overall height of a unit's health bar, in world units. */
export const HEALTH_BAR_HEIGHT = 4;
/**
 * Inset, in world units, of the health bar's bottom edge from the bottom
 * of a unit's shape — inward rather than below it, so the bar overlaps the
 * lower edge of the shape and stays inside the same grid cell instead of
 * spilling into the cell below.
 */
export const HEALTH_BAR_INSET = 2;

/** Background fill colour, behind the (narrower) health fill. */
const BACKGROUND_COLOR = 0x333333;
/** Colour and width of the 1px border drawn around the health bar. */
const BORDER_COLOR = 0x000000;
const BORDER_WIDTH = 1;

/** HP-fraction thresholds the fill colour switches at — see {@link healthBarColor}. */
const GREEN_THRESHOLD = 0.6;
const YELLOW_THRESHOLD = 0.3;

const GREEN = 0x4caf50;
const YELLOW = 0xffca28;
const RED = 0xf44336;

/** Colour and stroke width of the cross drawn over a dead unit. */
const DEATH_MARK_COLOR = 0x000000;
const DEATH_MARK_LINE_WIDTH = 2;

/**
 * Colour for a health bar's fill, driven purely by the HP fraction: green
 * above 60%, yellow above 30%, red at or below that. Boundary values
 * (exactly 0.6 or 0.3) fall into the lower band, so the bar reads "healthy"
 * only once it's strictly above a threshold.
 */
export function healthBarColor(fraction: number): number {
  if (fraction > GREEN_THRESHOLD) {
    return GREEN;
  }
  if (fraction > YELLOW_THRESHOLD) {
    return YELLOW;
  }
  return RED;
}

/**
 * Width of a health bar's fill, in world units, for a given current/max HP.
 * Clamped to `[0, barWidth]` so a `current` outside `[0, max]` (e.g. transient
 * over-heal) never draws past the background.
 */
export function healthBarFillWidth(
  current: number,
  max: number,
  barWidth = HEALTH_BAR_WIDTH
): number {
  if (max <= 0) {
    return 0;
  }
  const fraction = current / max;
  return Math.max(0, Math.min(barWidth, barWidth * fraction));
}

/** A health bar's two layers: a static background and a redrawn fill. */
export interface HealthBarView {
  container: Container;
  background: Graphics;
  fill: Graphics;
  /** Overall width this bar was built at, in world units — see {@link createHealthBar}. */
  width: number;
}

/**
 * Builds a health bar as a child `Container` positioned inset from the
 * bottom of a unit's shape (`unitSize - HEALTH_BAR_HEIGHT - HEALTH_BAR_INSET`
 * on the y axis, so the bar's own bottom edge sits `HEALTH_BAR_INSET` above
 * the shape's), with a background `Graphics` bordered by a 1px black outline
 * and a colour-coded fill `Graphics` on top. The bar is drawn as wide as the
 * unit itself (`unitSize * 2`, matching the shape's full width) rather than
 * a fixed size, so bigger units get a proportionally wider bar. The border
 * is drawn with `pixelLine: true` and `alignment: 0` (fully outside the
 * rect) so it stays a crisp, constant 1 screen-pixel line at every camera
 * zoom level instead of scaling — and shrinking to invisible, or
 * ballooning — with the world-space rect it outlines. Destroying the
 * returned container (e.g. via the parent entity view's
 * `destroy({ children: true })`) destroys both graphics with it.
 */
export function createHealthBar(unitSize: number): HealthBarView {
  const width = unitSize * 2;
  const container = new Container();
  container.position.set(-width / 2, unitSize - HEALTH_BAR_HEIGHT - HEALTH_BAR_INSET);

  const background = new Graphics()
    .rect(0, 0, width, HEALTH_BAR_HEIGHT)
    .fill(BACKGROUND_COLOR)
    .stroke({ width: BORDER_WIDTH, color: BORDER_COLOR, pixelLine: true, alignment: 0 });
  container.addChild(background);

  const fill = new Graphics();
  container.addChild(fill);

  return { container, background, fill, width };
}

/**
 * Compares an entity's current HP against the last value cached for it and,
 * on a mismatch, sets `renderable.dirty = true` and updates the cache to the
 * new value. An unchanged HP touches neither the flag nor the cache entry's
 * generation, so a caller who never redraws (and thus never clears `dirty`)
 * still won't re-mark it — the flag stays exactly as set.
 *
 * Deliberately Pixi-free: it operates on plain `{ renderable, health }`
 * objects and a `Map` cache keyed by entity identity, so it's unit-testable
 * without constructing a `RenderSystem` or any Pixi object.
 */
export function markDirtyOnHealthChange<T extends { renderable: Renderable; health: Health }>(
  entity: T,
  lastHealth: Map<T, number>
): void {
  const previous = lastHealth.get(entity);
  if (previous !== entity.health.current) {
    entity.renderable.dirty = true;
  }
  lastHealth.set(entity, entity.health.current);
}

/** Redraws a health bar's fill to match the given HP. Call only when dirty. */
export function drawHealthBarFill(fill: Graphics, health: Health, barWidth = HEALTH_BAR_WIDTH): void {
  fill.clear();
  const width = healthBarFillWidth(health.current, health.max, barWidth);
  if (width <= 0) {
    return;
  }
  const fraction = health.max > 0 ? health.current / health.max : 0;
  fill.rect(0, 0, width, HEALTH_BAR_HEIGHT).fill(healthBarColor(fraction));
}

/**
 * Redraws the cross marking a dead unit, centered on its shape. Draws nothing
 * (clearing any previous mark) when `isDead` is false, so callers can call
 * this unconditionally whenever HP changes rather than tracking alive/dead
 * transitions themselves.
 */
export function drawDeathMark(mark: Graphics, unitSize: number, isDead: boolean): void {
  mark.clear();
  if (!isDead) {
    return;
  }
  mark
    .moveTo(-unitSize, -unitSize)
    .lineTo(unitSize, unitSize)
    .moveTo(unitSize, -unitSize)
    .lineTo(-unitSize, unitSize)
    .stroke({ width: DEATH_MARK_LINE_WIDTH, color: DEATH_MARK_COLOR });
}
