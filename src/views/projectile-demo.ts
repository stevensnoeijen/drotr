import { World, type With } from 'miniplex';
import { Container, Graphics } from 'pixi.js';

import { fireProjectile, type RangedAttacker } from '~/game/combat/fire-projectile';
import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { RenderSystem } from '~/game/render/render-system';
import type { UnitSprites } from '~/game/render/sprites/unit-sprites';
import { createEffectSystem } from '~/game/systems/effect-system';
import { createProjectileSystem } from '~/game/systems/projectile-system';
import type { Point } from '~/lib/math/types';

/**
 * Rock launch demo for `#/unit-preview`: fires a rock from one point to
 * another and lets it land, running the game's own `fireProjectile`,
 * `ProjectileSystem`, `EffectSystem` and `RenderSystem`, so the arc, the
 * dirt burst and the cleanup are exactly what the game does. Kept apart
 * from the React view so it can be driven and tested without a canvas.
 */

/** World units per second the demo rock flies. */
const DEMO_ROCK_SPEED = 60;
/** World units per movement cell, only to convert the demo's attack range. */
const DEMO_CELL_SIZE = 16;
/** The unit whose sprite scale the rock and its impact are drawn at. */
const DEMO_FIRER = 'crossbowsoldier';

/** A launch point and a landing point, in demo world units. */
export const DEMO_FROM: Point = { x: 10, y: 60 };
export const DEMO_TO: Point = { x: 86, y: 60 };

export interface ProjectileDemo {
  /** Launches one rock from `DEMO_FROM` to `DEMO_TO`. */
  launch(): void;
  /** Advances the simulation by `dt` seconds and updates the views. */
  step(dt: number): void;
  /** Rocks in flight plus effects still playing. */
  readonly activeCount: number;
  /** Destroys every view and marker the demo added. */
  dispose(): void;
}

/**
 * Builds the demo inside `stage`. `sprites` must hold the rock, the
 * impact-dirt effect and the demo firer's sprite data.
 */
export function createProjectileDemo(sprites: UnitSprites, stage: Container): ProjectileDemo {
  const world = new World<Entity>();
  const queries = createQueries(world);
  const layer = new Container();
  stage.addChild(layer);
  const markers = new Graphics()
    .circle(DEMO_FROM.x, DEMO_FROM.y, 1.5)
    .fill(0x66ccff)
    .circle(DEMO_TO.x, DEMO_TO.y, 1.5)
    .fill(0xff6b6b);
  markers.label = 'markers';
  layer.addChild(markers);
  const renderSystem = new RenderSystem(queries.renderable, layer, false, sprites);
  const projectileSystem = createProjectileSystem(queries);
  const effectSystem = createEffectSystem(queries);

  // The rock's target never dies, so every launch lands.
  const target: With<Entity, 'transform'> = world.add({
    id: 2,
    transform: { position: { ...DEMO_TO }, rotation: 0 },
    health: { current: Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER },
  }) as With<Entity, 'transform'>;
  const distance = Math.hypot(DEMO_TO.x - DEMO_FROM.x, DEMO_TO.y - DEMO_FROM.y);

  return {
    launch() {
      const firer: RangedAttacker = {
        id: 1,
        team: 'blue',
        unitType: DEMO_FIRER,
        transform: { position: { ...DEMO_FROM }, rotation: 0 },
        renderable: { shape: 'circle', color: 0x66ccff, size: 6, extent: 8 },
        damage: { value: 0 },
        attackRange: { value: distance / DEMO_CELL_SIZE },
        ranged: { projectileSpeed: DEMO_ROCK_SPEED, projectile: 'rock', releaseTime: 0 },
      };
      fireProjectile(world, firer, target, target.id!, DEMO_CELL_SIZE);
    },
    step(dt) {
      projectileSystem(world, dt);
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
