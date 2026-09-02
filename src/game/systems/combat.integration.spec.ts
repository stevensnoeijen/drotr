import { World } from 'miniplex';
import { beforeEach, describe, expect, it } from 'vitest';

import { cellPosition, resetEntityIdCounter, spawnUnit } from '~/game/data/spawn';
import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import type { Renderable, Health } from '~/game/ecs/components';
import { markDirtyOnHealthChange } from '~/game/render/health-bar';
import { DEFAULT_FIXED_STEP } from '~/game/game-loop';
import { CELL_SIZE } from '~/lib/grid';
import { createCombatSystem } from './combat-system';
import { createMoveVelocitySystem } from './move-velocity-system';
import { createPerceptionSystem, runPerceptionScan } from './perception-system';
import { createSeekSystem } from './seek-system';

/**
 * End-to-end coverage for the `test` scenario's visual milestone, headlessly:
 * two swordsmen spawned out of attack range acquire each other via
 * `PerceptionSystem`, close the distance under `SeekSystem` +
 * `MoveVelocitySystem`, stop at `attackRange`, and then trade cooldown-gated
 * blows until one dies — wired in the same order as `game-canvas.tsx`.
 *
 * This is the case a `CombatSystem` unit test cannot cover on its own: it
 * proves that where `SeekSystem` actually parks a unit is somewhere
 * `CombatSystem` agrees is in range (the floating-point boundary the attack
 * epsilon exists for), rather than a hair outside it, which would leave the
 * two standing still and never fighting.
 */
describe('perception + seek + move + combat integration', () => {
  const DT = DEFAULT_FIXED_STEP;

  beforeEach(() => {
    resetEntityIdCounter();
  });

  function setup() {
    const world = new World<Entity>();
    const queries = createQueries(world);

    // Four cells apart: outside swordsmen's 1-cell attack range, inside
    // their 5-cell aggro range.
    const blue = spawnUnit(world, { type: 'swordsmen', team: 'blue', position: cellPosition(2, 0) });
    const red = spawnUnit(world, { type: 'swordsmen', team: 'red', position: cellPosition(6, 0) });

    // Matches `game-canvas.tsx`: one immediate scan at load, then the
    // periodic system, then seek, then integration, then combat.
    runPerceptionScan(world, queries);
    const perception = createPerceptionSystem(queries);
    const seek = createSeekSystem(queries);
    const move = createMoveVelocitySystem(queries);
    const combat = createCombatSystem(queries);

    const tick = () => {
      perception(world, DT);
      seek(world, DT);
      move(world, DT);
      combat(world, DT);
    };

    return { world, queries, blue, red, tick };
  }

  function distance(a: Entity, b: Entity): number {
    return Math.hypot(
      a.transform!.position.x - b.transform!.position.x,
      a.transform!.position.y - b.transform!.position.y
    );
  }

  it('closes the distance, stops at attack range, and fights to a kill', () => {
    const { blue, red, tick } = setup();

    expect(blue.target).toEqual({ entityId: red.id });
    expect(red.target).toEqual({ entityId: blue.id });
    expect(blue.health).toEqual({ current: 15, max: 15 });

    // Six seconds: ~0.75s to close 3 cells at 2 cells/s each, then five
    // 1s-cooldown swings of 3 damage to take 15 HP off.
    for (let i = 0; i < 360; i++) {
      tick();
    }

    // Parked exactly at the 1-cell attack range, not overlapping and not
    // stalled out of reach.
    expect(distance(blue, red)).toBeCloseTo(CELL_SIZE, 6);
    expect(blue.velocity).toEqual({ x: 0, y: 0 });

    // Both swing on the same schedule, but the blow that lands first kills:
    // a unit already at 0 HP is skipped before it can swing back that tick,
    // so the fight ends 3 damage short of mutual destruction.
    expect(red.health!.current).toBe(0);
    expect(blue.health!.current).toBe(3);
  });

  it('drains HP gradually rather than all at once, and never below zero', () => {
    const { blue, red, tick } = setup();

    const redHealthOverTime: number[] = [];
    for (let i = 0; i < 600; i++) {
      tick();
      redHealthOverTime.push(red.health!.current);
      expect(red.health!.current).toBeGreaterThanOrEqual(0);
      expect(blue.health!.current).toBeGreaterThanOrEqual(0);
    }

    // Every distinct HP value red passed through: full, then one step per
    // landed blow, down to 0.
    expect([...new Set(redHealthOverTime)]).toEqual([15, 12, 9, 6, 3, 0]);
  });

  it('stops attacking and drops the target the moment it dies', () => {
    const { blue, red, tick } = setup();

    for (let i = 0; i < 600; i++) {
      tick();
    }

    expect(red.health!.current).toBe(0);
    // Never driven negative by swings at a corpse, and the stale target is
    // gone rather than waiting on the next perception scan.
    expect(blue.target).toBeUndefined();
  });

  it('marks the loser\'s health bar dirty exactly once per landed blow', () => {
    const { blue, red, tick } = setup();

    const tracked = red as { renderable: Renderable; health: Health };
    const lastHealth = new Map<typeof tracked, number>();
    markDirtyOnHealthChange(tracked, lastHealth);
    red.renderable!.dirty = false;

    let redraws = 0;
    for (let i = 0; i < 600; i++) {
      tick();
      markDirtyOnHealthChange(tracked, lastHealth);
      if (red.renderable!.dirty) {
        redraws++;
        // Stand in for RenderSystem, which clears the flag once it redraws.
        red.renderable!.dirty = false;
      }
    }

    // 15 HP / 3 damage = five blows, five bar redraws — no more, no fewer.
    expect(redraws).toBe(5);
    expect(blue.health!.current).toBe(3);
  });
});
