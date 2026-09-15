import { World } from 'miniplex';
import { Container } from 'pixi.js';
import { beforeEach, describe, expect, it } from 'vitest';

import { cellPosition, resetEntityIdCounter, spawnUnit } from '~/game/data/spawn';
import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { RenderSystem } from '~/game/render/render-system';
import { DEFAULT_FIXED_STEP } from '~/game/game-loop';
import { createCombatSystem } from './combat-system';
import { DeathCleanupSystem } from './death-cleanup-system';
import { createDeathSystem, DEATH_REMOVAL_DELAY_SECONDS } from './death-system';
import { createMoveVelocitySystem } from './move-velocity-system';
import { createPerceptionSystem, runPerceptionScan } from './perception-system';
import { createSeekSystem } from './seek-system';

/**
 * End-to-end coverage for #96's visual milestone: a scripted battle run to
 * completion leaves no orphaned Pixi objects behind — `stage.children.length`
 * (here, the render layer standing in for `app.stage`) returns to its
 * pre-battle baseline once every corpse's removal delay has elapsed, and no
 * dead entity's container reference is retained by `RenderSystem`.
 *
 * Wired in the same order as `game-canvas.tsx`: perception, seek, move,
 * combat, then death.
 */
describe('death + render cleanup integration', () => {
  const DT = DEFAULT_FIXED_STEP;

  beforeEach(() => {
    resetEntityIdCounter();
  });

  function setup() {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const parent = new Container();
    const renderSystem = new RenderSystem(queries.renderable, parent);
    new DeathCleanupSystem(world);

    const blue = spawnUnit(world, { type: 'swordsmen', team: 'blue', position: cellPosition(2, 0) });
    const red = spawnUnit(world, { type: 'swordsmen', team: 'red', position: cellPosition(6, 0) });

    runPerceptionScan(world, queries);
    const perception = createPerceptionSystem(queries);
    const seek = createSeekSystem(queries);
    const move = createMoveVelocitySystem(queries);
    const combat = createCombatSystem(queries);
    const death = createDeathSystem(queries);

    const tick = () => {
      perception(world, DT);
      seek(world, DT);
      move(world, DT);
      combat(world, DT);
      death(world, DT);
      renderSystem.sync();
    };

    return { world, queries, parent, renderSystem, blue, red, tick };
  }

  it('returns stage.children.length to its pre-battle baseline once the battle resolves and corpses' +
    ' finish their removal delay', () => {
    const { parent, renderSystem, red, blue, tick } = setup();

    const baseline = 0;
    expect(parent.children.length).toBe(2);

    // Fight to a kill (matches combat.integration.spec.ts: ~6s of simulated
    // time is enough for a swordsmen duel to resolve).
    const ticksToKill = Math.ceil(6 / DT);
    for (let i = 0; i < ticksToKill; i++) {
      tick();
    }
    expect(red.health!.current).toBe(0);
    expect(blue.health!.current).toBeGreaterThan(0);

    // Both units' views are still around — the loser is a corpse, not yet
    // removed.
    expect(parent.children.length).toBe(2);
    expect(renderSystem.size).toBe(2);

    // Run out the removal delay for the corpse.
    const ticksToRemoval = Math.ceil(DEATH_REMOVAL_DELAY_SECONDS / DT) + 1;
    for (let i = 0; i < ticksToRemoval; i++) {
      tick();
    }

    expect(parent.children.length).toBe(1 + baseline);
    expect(renderSystem.size).toBe(1);
  });

  it('leaves no dead entity container reference retained anywhere once both units die', () => {
    // A mutual-kill setup: two units, both attacking, health low enough that
    // whichever swings first still leaves the other's blow already in
    // flight — not needed for this test, which only cares that whichever
    // side dies is fully cleaned up. Reuse the standard duel and additionally
    // kill the winner by zeroing its HP directly once the loser is dead,
    // exercising two corpses removed at once.
    const { parent, renderSystem, red, blue, tick } = setup();

    const ticksToKill = Math.ceil(6 / DT);
    for (let i = 0; i < ticksToKill; i++) {
      tick();
    }
    expect(red.health!.current).toBe(0);
    expect(blue.health!.current).toBeGreaterThan(0);

    blue.health!.current = 0;

    const ticksToRemoval = Math.ceil(DEATH_REMOVAL_DELAY_SECONDS / DT) + 1;
    for (let i = 0; i < ticksToRemoval; i++) {
      tick();
    }

    expect(parent.children.length).toBe(0);
    expect(renderSystem.size).toBe(0);
  });
});
