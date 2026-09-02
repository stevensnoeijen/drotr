import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import { CELL_SIZE } from '~/lib/grid';
import { createMoveVelocitySystem } from './move-velocity-system';
import { createSeekSystem } from './seek-system';

/**
 * Integration coverage for #131: `SeekSystem` and `MoveVelocitySystem`
 * running together, tick by tick, the way `game-canvas.tsx` wires them.
 */
describe('seek + move integration', () => {
  function setup(dt: number) {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const seek = createSeekSystem(queries);
    const move = createMoveVelocitySystem(queries);

    const target = world.add({
      transform: { position: { x: 10 * CELL_SIZE, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
    });
    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 3 * CELL_SIZE },
      attackRange: { value: 1 },
      target: { entityId: target.id! },
    });

    const tick = () => {
      seek(world, dt);
      move(world, dt);
    };

    return { self, target, tick };
  }

  it('closes to within attackRange of a stationary target and stops there, with no overshoot', () => {
    const dt = 1 / 60;
    const { self, target, tick } = setup(dt);

    // Enough ticks to fully close the distance and then settle.
    for (let i = 0; i < 600; i++) {
      tick();
    }

    const rangeWorld = 1 * CELL_SIZE;
    const distance = Math.abs(target.transform.position.x - self.transform.position.x);

    expect(distance).toBeLessThanOrEqual(rangeWorld);
    // Not just "in range" but resting essentially exactly at the boundary,
    // not stopped short or having overshot past the target.
    expect(distance).toBeGreaterThan(rangeWorld - CELL_SIZE * 3 * dt - 1e-6);
  });

  it('velocity is zero once within range', () => {
    const dt = 1 / 60;
    const { self, tick } = setup(dt);

    for (let i = 0; i < 600; i++) {
      tick();
    }

    expect(self.velocity).toEqual({ x: 0, y: 0 });
  });

  it('never overshoots the target position past the attack range on any single tick', () => {
    const dt = 1 / 60;
    const { self, target, tick } = setup(dt);

    const rangeWorld = 1 * CELL_SIZE;
    for (let i = 0; i < 600; i++) {
      tick();
      const distance = Math.abs(target.transform.position.x - self.transform.position.x);
      expect(distance).toBeGreaterThanOrEqual(rangeWorld - 1e-6);
    }
  });

  it('movement is framerate-independent: the same total simulated time produces identical positions regardless of step count', () => {
    const finePos = (() => {
      const { self, tick } = setup(1 / 240);
      for (let i = 0; i < 240; i++) {
        tick();
      }
      return { ...self.transform.position };
    })();

    const coarsePos = (() => {
      const { self, tick } = setup(1 / 30);
      for (let i = 0; i < 30; i++) {
        tick();
      }
      return { ...self.transform.position };
    })();

    expect(finePos.x).toBeCloseTo(coarsePos.x, 5);
    expect(finePos.y).toBeCloseTo(coarsePos.y, 5);
  });
});
