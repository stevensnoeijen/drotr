import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { DeathCleanupSystem } from './death-cleanup-system';

describe('DeathCleanupSystem', () => {
  it('clears a Target reference pointing at an entity the moment it is removed', () => {
    const world = new World<Entity>();
    new DeathCleanupSystem(world);

    const victim = world.add({ id: 1, health: { current: 0, max: 10 } });
    const attacker = world.add({ id: 2, target: { entityId: 1 } });

    world.remove(victim);

    expect(attacker.target).toBeUndefined();
  });

  it('leaves a Target pointing at a different, still-live entity alone', () => {
    const world = new World<Entity>();
    new DeathCleanupSystem(world);

    const victim = world.add({ id: 1, health: { current: 0, max: 10 } });
    world.add({ id: 2, health: { current: 5, max: 10 } });
    const attacker = world.add({ id: 3, target: { entityId: 2 } });

    world.remove(victim);

    expect(attacker.target).toEqual({ entityId: 2 });
  });

  it('clears every dangling Target in the same removal, not just the first found', () => {
    const world = new World<Entity>();
    new DeathCleanupSystem(world);

    const victim = world.add({ id: 1, health: { current: 0, max: 10 } });
    const a = world.add({ id: 2, target: { entityId: 1 } });
    const b = world.add({ id: 3, target: { entityId: 1 } });

    world.remove(victim);

    expect(a.target).toBeUndefined();
    expect(b.target).toBeUndefined();
  });

  it('removes a selected unit from the selection query on removal, with no extra bookkeeping needed', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    new DeathCleanupSystem(world);

    const entity = world.add({
      id: 1,
      health: { current: 0, max: 10 },
      selectable: true,
      selected: true,
    });
    expect([...queries.selected]).toContain(entity);

    world.remove(entity);

    expect([...queries.selected]).not.toContain(entity);
  });

  it('removes an AttachedTo entity from the world when its parent is removed', () => {
    const world = new World<Entity>();
    new DeathCleanupSystem(world);

    const parent = world.add({ id: 1, health: { current: 0, max: 10 } });
    const attachment = world.add({
      id: 2,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      attachedTo: { entityId: 1 },
    });

    world.remove(parent);

    expect(world.entities).not.toContain(attachment);
  });

  it('leaves an AttachedTo entity alone when a different entity is removed', () => {
    const world = new World<Entity>();
    new DeathCleanupSystem(world);

    world.add({ id: 1, health: { current: 5, max: 10 } });
    const other = world.add({ id: 2, health: { current: 0, max: 10 } });
    const attachment = world.add({
      id: 3,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      attachedTo: { entityId: 1 },
    });

    world.remove(other);

    expect(world.entities).toContain(attachment);
  });

  it('dispose stops reacting to further removals', () => {
    const world = new World<Entity>();
    const system = new DeathCleanupSystem(world);
    system.dispose();

    const victim = world.add({ id: 1, health: { current: 0, max: 10 } });
    const attacker = world.add({ id: 2, target: { entityId: 1 } });

    world.remove(victim);

    expect(attacker.target).toEqual({ entityId: 1 });
  });
});
