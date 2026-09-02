import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/types';
import { createMoveTargetSystem } from './move-target-system';

describe('createMoveTargetSystem', () => {
  it('sets velocity toward the move target, scaled to moveSpeed', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createMoveTargetSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 10 },
      moveTarget: { position: { x: 100, y: 0 } },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 10, y: 0 });
    expect(self.moveTarget).toBeDefined();
  });

  it('points velocity diagonally toward an off-axis destination', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createMoveTargetSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 5 },
      moveTarget: { position: { x: 30, y: 40 } },
    });

    system(world, 1 / 60);

    // Distance is 50 (3-4-5 triangle), so unit vector is (0.6, 0.8).
    expect(self.velocity.x).toBeCloseTo(3);
    expect(self.velocity.y).toBeCloseTo(4);
  });

  it('advances the unit toward its target at the expected speed over a full step', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const moveTargetSystem = createMoveTargetSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 60 },
      moveTarget: { position: { x: 600, y: 0 } },
    });

    const dt = 1;
    moveTargetSystem(world, dt);
    self.transform.position.x += self.velocity.x * dt;
    self.transform.position.y += self.velocity.y * dt;

    expect(self.transform.position.x).toBeCloseTo(60);
    expect(self.moveTarget).toBeDefined();
  });

  it('clears the target and zeroes velocity once within arrival tolerance', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createMoveTargetSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 5, y: 0 },
      moveSpeed: { value: 10 },
      moveTarget: { position: { x: 0.5, y: 0 } },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 0, y: 0 });
    expect(self.moveTarget).toBeUndefined();
  });

  it('clears the target exactly on arrival (no overshoot) for a step that would otherwise pass it', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createMoveTargetSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 100 },
      moveTarget: { position: { x: 10, y: 0 } },
    });

    const dt = 1;
    system(world, dt);
    self.transform.position.x += self.velocity.x * dt;

    expect(self.transform.position.x).toBeCloseTo(10);
  });

  it('leaves velocity untouched for an entity with no move target', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createMoveTargetSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 3, y: 4 },
      moveSpeed: { value: 10 },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 3, y: 4 });
  });
});
