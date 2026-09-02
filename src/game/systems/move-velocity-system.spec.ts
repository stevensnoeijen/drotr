import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import { createMoveVelocitySystem } from './move-velocity-system';

describe('createMoveVelocitySystem', () => {
  it('integrates position from velocity by dt', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createMoveVelocitySystem(queries);

    const entity = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 10, y: -20 },
      moveSpeed: { value: 100 },
    });

    system(world, 0.5);

    expect(entity.transform.position).toEqual({ x: 5, y: -10 });
  });

  it('faces the direction of travel while moving', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createMoveVelocitySystem(queries);

    const entity = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 1, y: 0 },
      moveSpeed: { value: 100 },
    });

    system(world, 1 / 60);

    expect(entity.transform.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('keeps the last facing once velocity returns to zero', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createMoveVelocitySystem(queries);

    const entity = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 1 },
      moveSpeed: { value: 100 },
    });

    system(world, 1 / 60);
    const facingWhileMoving = entity.transform.rotation;
    expect(facingWhileMoving).toBeCloseTo(Math.PI);

    entity.velocity.x = 0;
    entity.velocity.y = 0;
    system(world, 1 / 60);

    expect(entity.transform.rotation).toBe(facingWhileMoving);
  });

  it('does not move an entity with zero velocity', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createMoveVelocitySystem(queries);

    const entity = world.add({
      transform: { position: { x: 3, y: 4 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 100 },
    });

    system(world, 1);

    expect(entity.transform.position).toEqual({ x: 3, y: 4 });
  });

  it('is framerate-independent: the same accumulated dt produces the same position regardless of step count', () => {
    const world1 = new World<Entity>();
    const queries1 = createQueries(world1);
    const system1 = createMoveVelocitySystem(queries1);
    const entityA = world1.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 60, y: 30 },
      moveSpeed: { value: 100 },
    });

    // 60 small steps of 1/60s.
    for (let i = 0; i < 60; i++) {
      system1(world1, 1 / 60);
    }

    const world2 = new World<Entity>();
    const queries2 = createQueries(world2);
    const system2 = createMoveVelocitySystem(queries2);
    const entityB = world2.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 60, y: 30 },
      moveSpeed: { value: 100 },
    });

    // 4 larger steps of 1/4s, same total elapsed time.
    for (let i = 0; i < 4; i++) {
      system2(world2, 0.25);
    }

    expect(entityA.transform.position.x).toBeCloseTo(entityB.transform.position.x);
    expect(entityA.transform.position.y).toBeCloseTo(entityB.transform.position.y);
  });
});
