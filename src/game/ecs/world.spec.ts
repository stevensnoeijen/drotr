import { World } from 'miniplex';
import { beforeEach, describe, expect, it } from 'vitest';

import { createQueries } from './world';
import type { Entity } from './types';

describe('archetype queries', () => {
  let world: World<Entity>;
  let queries: ReturnType<typeof createQueries>;

  beforeEach(() => {
    world = new World<Entity>();
    queries = createQueries(world);
  });

  it('an empty world has empty queries', () => {
    expect(world.size).toBe(0);
    expect(queries.movable.size).toBe(0);
    expect(queries.renderable.size).toBe(0);
    expect(queries.selected.size).toBe(0);
  });

  it('matches an entity to exactly the queries it qualifies for', () => {
    const soldier = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 1, y: 0 },
      moveSpeed: { value: 10 },
      renderable: { shape: 'circle', color: 0x66ccff, size: 8 },
      selectable: true,
      health: { current: 100, max: 100 },
      team: 'blue',
    });

    const scenery = world.add({
      transform: { position: { x: 5, y: 5 }, rotation: 0 },
      renderable: { shape: 'square', color: 0x333333, size: 16 },
    });

    expect([...queries.movable]).toEqual([soldier]);
    expect([...queries.moving]).toEqual([soldier]);
    expect([...queries.selectable]).toEqual([soldier]);
    expect([...queries.living]).toEqual([soldier]);

    // Both have transform + renderable.
    expect([...queries.renderable]).toEqual([soldier, scenery]);

    // Neither is selected yet.
    expect([...queries.selected]).toEqual([]);
  });

  it('adds an entity to queries when a component is added', () => {
    const entity = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      selectable: true,
    });

    expect([...queries.selected]).toEqual([]);

    world.addComponent(entity, 'selected', true);
    expect([...queries.selected]).toEqual([entity]);

    world.removeComponent(entity, 'selected');
    expect([...queries.selected]).toEqual([]);
  });

  it('removes an entity from every query when it leaves the world', () => {
    const entity = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 5 },
      renderable: { shape: 'circle', color: 0xffffff, size: 4 },
    });

    expect(queries.movable.size).toBe(1);
    expect(queries.renderable.size).toBe(1);

    world.remove(entity);

    expect(world.size).toBe(0);
    expect(queries.movable.size).toBe(0);
    expect(queries.moving.size).toBe(0);
    expect(queries.renderable.size).toBe(0);
  });

  it('excludes an entity that is missing a required component', () => {
    // Has transform + velocity but no moveSpeed: moving, but not movable.
    const drifting = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 1, y: 1 },
    });

    expect([...queries.moving]).toEqual([drifting]);
    expect([...queries.movable]).toEqual([]);
  });
});
