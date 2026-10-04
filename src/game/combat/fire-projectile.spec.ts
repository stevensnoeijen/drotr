import { World, type With } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { DEFAULT_CELL_SIZE } from '~/lib/grid';
import { fireProjectile, type RangedAttacker } from './fire-projectile';

/** A crossbow soldier, laid out as `spawnUnit` lays one out. */
function crossbowSoldier(overrides: Partial<RangedAttacker> = {}): RangedAttacker {
  return {
    id: 1,
    team: 'blue',
    unitType: 'crossbowsoldier',
    transform: { position: { x: 0, y: 0 }, rotation: 0 },
    renderable: { shape: 'triangle', color: 0x66ccff, size: 6, extent: 8 },
    damage: { value: 4 },
    attackRange: { value: 5 },
    ranged: { projectileSpeed: 300, projectile: 'bolt', releaseTime: 0 },
    ...overrides,
  };
}

describe('fireProjectile', () => {
  it('spawns a projectile aimed at the target, carrying the firer\'s damage and range', () => {
    const world = new World<Entity>();

    const attacker = crossbowSoldier();
    const target: With<Entity, 'transform'> = {
      id: 2,
      transform: { position: { x: 0, y: -100 }, rotation: 0 },
    };

    fireProjectile(world, attacker, target, target.id!, DEFAULT_CELL_SIZE);

    const spawned = [...world.entities].find((e) => e.projectile);
    expect(spawned).toBeDefined();
    expect(spawned!.transform).toEqual({ position: { x: 0, y: 0 }, rotation: 0 });
    expect(spawned!.damage).toEqual({ value: 4 });
    expect(spawned!.projectile).toEqual({
      type: 'bolt',
      sourceUnitType: 'crossbowsoldier',
      sourceTeam: 'blue',
      targetId: 2,
      maxRange: 15 * DEFAULT_CELL_SIZE,
      traveled: 0,
    });
    // Aimed straight up (target due north) at the firer's projectile speed.
    expect(spawned!.velocity!.x).toBeCloseTo(0);
    expect(spawned!.velocity!.y).toBeCloseTo(-300);
  });

  it("takes the projectile's type from the firer's Ranged", () => {
    const world = new World<Entity>();
    const target: With<Entity, 'transform'> = {
      id: 2,
      transform: { position: { x: 50, y: 0 }, rotation: 0 },
    };

    fireProjectile(world, crossbowSoldier(), target, 2, DEFAULT_CELL_SIZE);

    const [spawned] = world.with('projectile');
    expect(spawned.projectile.type).toBe('bolt');
  });

  it("lays the projectile out in the firer's box, to be drawn at the firer's scale", () => {
    const world = new World<Entity>();
    const attacker = crossbowSoldier({ team: 'red' });
    attacker.renderable = { shape: 'triangle', color: 0xff6b6b, size: 8, extent: 10 };
    const target: With<Entity, 'transform'> = {
      id: 2,
      transform: { position: { x: 50, y: 0 }, rotation: 0 },
    };

    fireProjectile(world, attacker, target, 2, DEFAULT_CELL_SIZE);

    const [spawned] = world.with('projectile', 'renderable');
    expect(spawned.renderable).toMatchObject({ color: 0xff6b6b, size: 8, extent: 10 });
  });

  it('gives the projectile no unit type, so nothing keyed on one picks it up', () => {
    const world = new World<Entity>();
    const target: With<Entity, 'transform'> = {
      id: 2,
      transform: { position: { x: 50, y: 0 }, rotation: 0 },
    };

    fireProjectile(world, crossbowSoldier(), target, 2, DEFAULT_CELL_SIZE);

    const [spawned] = world.with('projectile');
    expect(spawned.unitType).toBeUndefined();
    expect(spawned.selectable).toBeUndefined();
    expect(spawned.hoverable).toBeUndefined();
    expect(spawned.health).toBeUndefined();
    expect(spawned.team).toBeUndefined();
  });

  it('gives every fired projectile a distinct id', () => {
    const world = new World<Entity>();
    const attacker = crossbowSoldier({
      team: 'red',
      damage: { value: 1 },
      ranged: { projectileSpeed: 100, projectile: 'bolt', releaseTime: 0 },
    });
    const target: With<Entity, 'transform'> = { id: 2, transform: { position: { x: 10, y: 0 }, rotation: 0 } };

    fireProjectile(world, attacker, target, 2, DEFAULT_CELL_SIZE);
    fireProjectile(world, attacker, target, 2, DEFAULT_CELL_SIZE);

    const ids = [...world.entities].filter((e) => e.projectile).map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });
});
