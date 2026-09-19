import { World, type With } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { CELL_SIZE } from '~/lib/grid';
import { fireProjectile, type RangedAttacker } from './fire-projectile';

describe('fireProjectile', () => {
  it('spawns a projectile aimed at the target, carrying the firer\'s damage and range', () => {
    const world = new World<Entity>();

    const attacker: RangedAttacker = {
      id: 1,
      team: 'blue',
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      damage: { value: 4 },
      attackRange: { value: 5 },
      ranged: { projectileSpeed: 300 },
    };
    const target: With<Entity, 'transform'> = {
      id: 2,
      transform: { position: { x: 0, y: -100 }, rotation: 0 },
    };

    fireProjectile(world, attacker, target, target.id!);

    const spawned = [...world.entities].find((e) => e.projectile);
    expect(spawned).toBeDefined();
    expect(spawned!.transform).toEqual({ position: { x: 0, y: 0 }, rotation: 0 });
    expect(spawned!.damage).toEqual({ value: 4 });
    expect(spawned!.projectile).toEqual({
      sourceTeam: 'blue',
      targetId: 2,
      maxRange: 5 * CELL_SIZE,
      traveled: 0,
    });
    // Aimed straight up (target due north) at the firer's projectile speed.
    expect(spawned!.velocity!.x).toBeCloseTo(0);
    expect(spawned!.velocity!.y).toBeCloseTo(-300);
    // Drawn by the existing reactive render path as a small circle.
    expect(spawned!.renderable?.shape).toBe('circle');
  });

  it('gives every fired projectile a distinct id', () => {
    const world = new World<Entity>();
    const attacker: RangedAttacker = {
      id: 1,
      team: 'red',
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      damage: { value: 1 },
      attackRange: { value: 5 },
      ranged: { projectileSpeed: 100 },
    };
    const target: With<Entity, 'transform'> = { id: 2, transform: { position: { x: 10, y: 0 }, rotation: 0 } };

    fireProjectile(world, attacker, target, 2);
    fireProjectile(world, attacker, target, 2);

    const ids = [...world.entities].filter((e) => e.projectile).map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });
});
