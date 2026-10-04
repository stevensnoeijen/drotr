import { World, type With } from 'miniplex';
import { Container } from 'pixi.js';

import { fireProjectile, type RangedAttacker } from '~/game/combat/fire-projectile';
import { allocateEntityId } from '~/game/data/spawn';
import type { Renderable } from '~/game/ecs/components';
import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { RenderSystem } from '~/game/render/render-system';
import type { Direction } from '~/game/render/sprites/animation-key';
import type { UnitSprites } from '~/game/render/sprites/unit-sprites';
import { createEffectSystem } from '~/game/systems/effect-system';
import { createProjectileSystem } from '~/game/systems/projectile-system';
import type { Point } from '~/lib/math/types';

/**
 * Catapult firing demo for `#/unit-preview`: launches rocks from the
 * catapult's position to a landing point, running the game's own
 * `fireProjectile`, `ProjectileSystem`, `EffectSystem` and `RenderSystem`,
 * so the arc, the dirt burst and the view cleanup are exactly what the game
 * does. The catapult itself is the preview's own animated sprite; this only
 * owns the rock and its impact. Kept apart from the React view so it can be
 * driven and tested without a canvas.
 */

/** World units per second a demo rock flies. */
const DEMO_ROCK_SPEED = 150;

/** World units per movement cell (a 40 px tile, two cells wide). */
export const DEMO_CELL_SIZE = 20;

/** The unit that fires, and whose sprite scale the rock and its impact use. */
export const DEMO_FIRER = 'catapult';

/**
 * The firer's box: the catapult is 1.5 tiles across, so 3 cells and a
 * half-extent of 30 world units, the same box `spawnUnit` would give it.
 * The preview draws the catapult sprite fitted to it (see `spriteScale`).
 */
export const DEMO_FIRER_RENDERABLE: Renderable = {
  shape: 'square',
  color: 0xcccccc,
  size: 28,
  extent: 30,
};

/** Distance, in world units, from the catapult to where its rock lands. */
export const DEMO_FLIGHT_DISTANCE = 180;

/**
 * How far out the preview is zoomed while the demo runs, so the whole flight
 * and the impact fit the canvas.
 */
export const DEMO_ZOOM = 1.5;

/** Unit vector of each facing, in screen coordinates (y grows downward). */
const FACING: Readonly<Record<Direction, Point>> = {
  n: { x: 0, y: -1 },
  ne: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  e: { x: 1, y: 0 },
  se: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  s: { x: 0, y: 1 },
  sw: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  w: { x: -1, y: 0 },
  nw: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
};

/**
 * Where a catapult facing `direction` launches from and where its rock
 * lands, centred on the origin so the whole flight sits in the middle of
 * the view.
 */
export function demoFlight(direction: Direction): { from: Point; to: Point } {
  const v = FACING[direction];
  const half = DEMO_FLIGHT_DISTANCE / 2;
  return {
    from: { x: -v.x * half, y: -v.y * half },
    to: { x: v.x * half, y: v.y * half },
  };
}

export interface ProjectileDemoOptions {
  from: Point;
  to: Point;
  /** Whether a landing rock leaves its dirt burst. */
  impact: boolean;
}

export interface ProjectileDemo {
  /** Launches one rock from the catapult. */
  launch(): void;
  /** Advances the simulation by `dt` seconds and updates the views. */
  step(dt: number): void;
  /** Rocks in flight plus effects still playing. */
  readonly activeCount: number;
  /** Destroys every view the demo added to its parent. */
  dispose(): void;
}

/**
 * Builds the demo inside `parent`, a container in demo world units. `sprites`
 * must hold the rock, the impact-dirt effect and the catapult (for scale).
 */
export function createProjectileDemo(
  sprites: UnitSprites,
  parent: Container,
  { from, to, impact }: ProjectileDemoOptions
): ProjectileDemo {
  const world = new World<Entity>();
  const queries = createQueries(world);
  const layer = new Container();
  parent.addChild(layer);
  const renderSystem = new RenderSystem(queries.renderable, layer, false, sprites);
  const projectileSystem = createProjectileSystem(queries);
  const effectSystem = createEffectSystem(queries);

  // The rock's target never dies, so every launch lands.
  const target = world.add({
    id: allocateEntityId(),
    transform: { position: { ...to }, rotation: 0 },
    health: { current: Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER },
  }) as With<Entity, 'transform'>;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);

  return {
    launch() {
      const firer: RangedAttacker = {
        id: allocateEntityId(),
        team: 'blue',
        unitType: DEMO_FIRER,
        transform: { position: { ...from }, rotation: 0 },
        renderable: { ...DEMO_FIRER_RENDERABLE },
        damage: { value: 0 },
        attackRange: { value: distance / DEMO_CELL_SIZE },
        ranged: { projectileSpeed: DEMO_ROCK_SPEED, projectile: 'rock', releaseTime: 0 },
      };
      fireProjectile(world, firer, target, target.id!, DEMO_CELL_SIZE);
    },
    step(dt) {
      projectileSystem(world, dt);
      if (!impact) {
        // The game spawns the burst on every rock hit; with it switched off
        // the demo just drops it before it is ever drawn.
        for (const effect of [...queries.effects]) world.remove(effect);
      }
      effectSystem(world, dt);
      renderSystem.sync();
    },
    get activeCount() {
      return queries.projectiles.size + queries.effects.size;
    },
    dispose() {
      renderSystem.dispose();
      world.clear();
      layer.destroy({ children: true });
    },
  };
}
