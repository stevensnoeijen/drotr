import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { createProjectileAimSystem } from './projectile-aim-system';

describe('createProjectileAimSystem', () => {
  it("rotates a projectile to point at its owner's current target", () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createProjectileAimSystem(queries);

    const owner = world.add({
      id: 1,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      target: { entityId: 2 },
    });
    world.add({
      id: 2,
      transform: { position: { x: 0, y: -100 }, rotation: 0 },
    });
    const projectile = world.add({
      id: 3,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      aimSource: { unitId: owner.id as number },
    });

    system(world, 1 / 60);

    // Target due north of the projectile: facing angle 0 (quantized).
    expect(projectile.transform?.rotation).toBe(0);
  });

  it("leaves rotation untouched when the owner has no current target", () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createProjectileAimSystem(queries);

    const owner = world.add({
      id: 1,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
    });
    const projectile = world.add({
      id: 2,
      transform: { position: { x: 0, y: 0 }, rotation: 1.23 },
      aimSource: { unitId: owner.id as number },
    });

    system(world, 1 / 60);

    expect(projectile.transform?.rotation).toBe(1.23);
  });

  it('leaves rotation untouched when the target no longer exists', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createProjectileAimSystem(queries);

    const owner = world.add({
      id: 1,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      target: { entityId: 999 },
    });
    const projectile = world.add({
      id: 2,
      transform: { position: { x: 0, y: 0 }, rotation: 1.23 },
      aimSource: { unitId: owner.id as number },
    });

    system(world, 1 / 60);

    expect(projectile.transform?.rotation).toBe(1.23);
  });

  it('leaves rotation untouched when the owner no longer exists', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createProjectileAimSystem(queries);

    const projectile = world.add({
      id: 2,
      transform: { position: { x: 0, y: 0 }, rotation: 1.23 },
      aimSource: { unitId: 999 },
    });

    system(world, 1 / 60);

    expect(projectile.transform?.rotation).toBe(1.23);
  });
});
