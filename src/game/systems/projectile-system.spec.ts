import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { createProjectileSystem } from './projectile-system';

const DT = 1 / 60;
const SPEED = 320; // world units/sec

let nextId = 1;

function makeTarget(world: World<Entity>, x: number, health = 10): Entity {
  return world.add({
    id: nextId++,
    transform: { position: { x, y: 0 }, rotation: 0 },
    health: { current: health, max: health },
  });
}

function makeProjectile(
  world: World<Entity>,
  options: { targetId: number; damage?: number; maxRange?: number; vx?: number }
): Entity {
  const { targetId, damage = 4, maxRange = 1000, vx = SPEED } = options;
  return world.add({
    id: nextId++,
    transform: { position: { x: 0, y: 0 }, rotation: 0 },
    velocity: { x: vx, y: 0 },
    damage: { value: damage },
    projectile: { sourceTeam: 'blue', targetId, maxRange, traveled: 0 },
  });
}

describe('createProjectileSystem', () => {
  it('reaches its target in the expected number of fixed steps and lands the hit exactly once', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createProjectileSystem(queries);

    const distance = 100;
    const target = makeTarget(world, distance);
    makeProjectile(world, { targetId: target.id! });

    const expectedTicks = Math.ceil(distance / (SPEED * DT));

    for (let i = 0; i < expectedTicks - 1; i++) {
      system(world, DT);
      expect(target.health!.current).toBe(10);
      expect(queries.projectiles.size).toBe(1);
    }

    system(world, DT);
    expect(target.health!.current).toBe(6);
    expect(queries.projectiles.size).toBe(0);

    // Already removed: further ticks must not apply any more damage.
    system(world, DT);
    expect(target.health!.current).toBe(6);
  });

  it('lands the hit rather than expiring as a miss when fired exactly at maxRange', () => {
    // This is the realistic case: `CombatSystem` only fires once a target is
    // within `attackRange`, and `fireProjectile` sets `maxRange` from that
    // same value, so a shot's `maxRange` almost always equals the distance
    // to its target at fire time. `distance` (recomputed fresh each tick)
    // and `maxRange - traveled` (accumulated by repeated `+= step`) must
    // still agree on which tick the shot arrives, despite drifting apart by
    // float noise over many ticks — see `HIT_EPSILON` in the system itself.
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createProjectileSystem(queries);

    const distance = 160;
    const target = makeTarget(world, distance);
    makeProjectile(world, { targetId: target.id!, damage: 4, maxRange: distance });

    for (let i = 0; i < 60; i++) {
      system(world, DT);
    }

    expect(target.health!.current).toBe(6);
    expect(queries.projectiles.size).toBe(0);
  });

  it('applies damage once on impact, not once per tick while closing the distance', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createProjectileSystem(queries);

    const target = makeTarget(world, 50);
    makeProjectile(world, { targetId: target.id!, damage: 3 });

    const damageDrops: number[] = [];
    let previous = target.health!.current;
    for (let i = 0; i < 20; i++) {
      system(world, DT);
      if (target.health!.current !== previous) {
        damageDrops.push(previous - target.health!.current);
        previous = target.health!.current;
      }
    }

    expect(damageDrops).toEqual([3]);
  });

  it('expires without damage when its target dies mid-flight, and never damages a later replacement', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createProjectileSystem(queries);

    const target = makeTarget(world, 200);
    makeProjectile(world, { targetId: target.id! });

    // Target dies (marked at 0 HP) before the shot arrives.
    system(world, DT);
    target.health!.current = 0;
    system(world, DT);

    // The projectile expired rather than driving HP negative or lingering.
    expect(target.health!.current).toBe(0);
    expect(queries.projectiles.size).toBe(0);

    // A freshly spawned unit (distinct id) is unaffected by the spent shot.
    const replacement = makeTarget(world, 200, 10);
    system(world, DT);
    expect(replacement.health!.current).toBe(10);
  });

  it('expires as a miss once it travels its max range without hitting anything', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createProjectileSystem(queries);

    // Target far out of the projectile's max range: it can never catch up.
    const target = makeTarget(world, 10000);
    const maxRange = 100;
    makeProjectile(world, { targetId: target.id!, maxRange });

    const ticksToExpire = Math.ceil(maxRange / (SPEED * DT));
    for (let i = 0; i < ticksToExpire; i++) {
      system(world, DT);
    }

    expect(queries.projectiles.size).toBe(0);
    expect(target.health!.current).toBe(10);
  });

  it('leaves no projectile entities behind after a whole volley resolves', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createProjectileSystem(queries);

    const hitTarget = makeTarget(world, 60);
    const deadTarget = makeTarget(world, 200);
    const missTarget = makeTarget(world, 10000);

    makeProjectile(world, { targetId: hitTarget.id! });
    makeProjectile(world, { targetId: deadTarget.id! });
    makeProjectile(world, { targetId: missTarget.id!, maxRange: 50 });

    deadTarget.health!.current = 0;

    for (let i = 0; i < 200; i++) {
      system(world, DT);
    }

    expect(queries.projectiles.size).toBe(0);
    expect(hitTarget.health!.current).toBeLessThan(10);
  });
});
