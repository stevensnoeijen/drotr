import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import { CELL_SIZE } from '~/lib/grid';
import { createSeekSystem } from './seek-system';

describe('createSeekSystem', () => {
  it('sets velocity toward the target, scaled to moveSpeed', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createSeekSystem(queries);

    const target = world.add({
      transform: { position: { x: 100, y: 0 }, rotation: 0 },
    });
    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 10 },
      attackRange: { value: 1 },
      target: { entityId: target.id! },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 10, y: 0 });
  });

  it('points velocity diagonally toward a target off-axis', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createSeekSystem(queries);

    const target = world.add({
      transform: { position: { x: 30, y: 40 }, rotation: 0 },
    });
    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 5 },
      attackRange: { value: 0 },
      target: { entityId: target.id! },
    });

    system(world, 1 / 60);

    // Distance is 50 (3-4-5 triangle), so unit vector is (0.6, 0.8).
    expect(self.velocity.x).toBeCloseTo(3);
    expect(self.velocity.y).toBeCloseTo(4);
  });

  it('zeroes velocity once within attackRange of the target', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createSeekSystem(queries);

    const target = world.add({
      transform: { position: { x: 1.5 * CELL_SIZE, y: 0 }, rotation: 0 },
    });
    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 5, y: 0 },
      moveSpeed: { value: 10 },
      attackRange: { value: 2 },
      target: { entityId: target.id! },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 0, y: 0 });
  });

  it('zeroes velocity exactly at the attackRange boundary (no overshoot)', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createSeekSystem(queries);

    const target = world.add({
      transform: { position: { x: 2 * CELL_SIZE, y: 0 }, rotation: 0 },
    });
    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 5, y: 0 },
      moveSpeed: { value: 10 },
      attackRange: { value: 2 },
      target: { entityId: target.id! },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 0, y: 0 });
  });

  it('leaves velocity untouched for an entity with no target', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createSeekSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 3, y: 4 },
      moveSpeed: { value: 10 },
      attackRange: { value: 1 },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 3, y: 4 });
  });

  it('leaves velocity untouched when the target no longer resolves to an entity', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createSeekSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 3, y: 4 },
      moveSpeed: { value: 10 },
      attackRange: { value: 1 },
      target: { entityId: 9999 },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 3, y: 4 });
  });
});
