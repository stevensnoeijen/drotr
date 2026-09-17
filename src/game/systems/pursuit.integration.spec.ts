import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import { CELL_SIZE } from '~/lib/grid';
import type { CollisionGrid } from '~/lib/navigation/astar';
import { createMovePathSystem } from './move-path-system';
import { createMoveTargetSystem } from './move-target-system';
import { createMoveVelocitySystem } from './move-velocity-system';
import { createPerceptionSystem } from './perception-system';
import { createSeekSystem } from './seek-system';

/** A collision grid in the exact shape a loaded map exposes. */
function gridFrom(art: string): CollisionGrid {
  const rows = art
    .trim()
    .split('\n')
    .map((line) => [...line.trim()]);
  const width = rows[0].length;
  const collision = new Uint8Array(width * rows.length);
  rows.forEach((row, y) =>
    row.forEach((cell, x) => {
      collision[y * width + x] = cell === '#' ? 1 : 0;
    })
  );

  return { width, height: rows.length, collision };
}

const centre = (col: number, row: number) => ({
  x: col * CELL_SIZE + CELL_SIZE / 2,
  y: row * CELL_SIZE + CELL_SIZE / 2,
});

/**
 * Integration coverage for #195: a unit whose target sits behind a wall
 * actually walks around it and arrives in attack range, with
 * `PerceptionSystem`, `SeekSystem` and the whole `MovePath` ->
 * `MoveTarget` -> `MoveVelocity` movement pipeline running together in the
 * order `game-canvas.tsx` wires them.
 *
 * `CellOccupancySystem` is left out deliberately: these cases are about
 * terrain routing, and unit-to-unit blocking has its own integration spec.
 */
describe('pursuit + movement integration', () => {
  /** A wall down column 4, open along the bottom row. */
  const wallWithGap = gridFrom(`
    ....#....
    ....#....
    ....#....
    ....#....
    .........
  `);

  function setup(grid: CollisionGrid, enemyCell = centre(8, 0)) {
    const world = new World<Entity>();
    const queries = createQueries(world);

    const perception = createPerceptionSystem(queries, 1);
    const seek = createSeekSystem(queries, grid);
    const movePath = createMovePathSystem(queries);
    const moveTarget = createMoveTargetSystem(queries);
    const moveVelocity = createMoveVelocitySystem(queries);

    const enemy = world.add({
      id: 1,
      transform: { position: { ...enemyCell }, rotation: 0 },
      team: 'red' as const,
      health: { current: 100, max: 100 },
      aggroRange: { value: 0 },
    });
    const self = world.add({
      id: 2,
      transform: { position: { ...centre(0, 0) }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      // Fast enough to cross the map inside a few simulated seconds.
      moveSpeed: { value: 6 * CELL_SIZE },
      attackRange: { value: 1 },
      aggroRange: { value: 50 },
      team: 'blue' as const,
      health: { current: 100, max: 100 },
    });

    const dt = 1 / 60;
    const tick = () => {
      perception(world, dt);
      seek(world, dt);
      movePath(world, dt);
      moveTarget(world, dt);
      moveVelocity(world, dt);
    };

    const distanceToEnemy = () =>
      Math.hypot(
        enemy.transform.position.x - self.transform.position.x,
        enemy.transform.position.y - self.transform.position.y
      );

    return { world, self, enemy, tick, distanceToEnemy, dt };
  }

  it('walks around the wall and comes to rest in attack range of the target', () => {
    const { self, tick, distanceToEnemy } = setup(wallWithGap);

    // ~10 simulated seconds: ample for the route, with time to settle.
    for (let i = 0; i < 600; i++) {
      tick();
    }

    expect(distanceToEnemy()).toBeLessThanOrEqual(1 * CELL_SIZE + 1e-6);
    expect(self.velocity).toEqual({ x: 0, y: 0 });
    // Arrived: nothing left to route or steer toward.
    expect(self.pursuit).toBeUndefined();
    expect(self.movePath).toBeUndefined();
    expect(self.moveTarget).toBeUndefined();
  });

  it('never walks into the wall on the way there', () => {
    const { self, tick } = setup(wallWithGap);

    for (let i = 0; i < 600; i++) {
      tick();
      const col = Math.floor(self.transform.position.x / CELL_SIZE);
      const row = Math.floor(self.transform.position.y / CELL_SIZE);
      expect(wallWithGap.collision[row * wallWithGap.width + col]).toBe(0);
    }
  });

  it('keeps up with a target that walks along the far side of the wall', () => {
    const { self, enemy, tick, distanceToEnemy } = setup(wallWithGap);

    for (let i = 0; i < 900; i++) {
      // The enemy shuffles down the far side for the first second, staying
      // out of sight, so the route has to be replanned en route.
      if (i < 60 && i % 20 === 0) {
        enemy.transform.position.y += CELL_SIZE;
      }
      tick();
    }

    expect(distanceToEnemy()).toBeLessThanOrEqual(1 * CELL_SIZE + 1e-6);
    // At rest, to within the float slack a clamped final approach leaves
    // behind.
    expect(Math.hypot(self.velocity.x, self.velocity.y)).toBeLessThan(1e-6);
  });

  it('still reaches a target in the open with no route at all', () => {
    const open = gridFrom(`
      .........
      .........
      .........
      .........
      .........
    `);
    const { self, tick, distanceToEnemy } = setup(open);

    for (let i = 0; i < 600; i++) {
      tick();
      // Straight-line seeking the whole way: no wall, nothing to route past.
      expect(self.movePath).toBeUndefined();
    }

    expect(distanceToEnemy()).toBeLessThanOrEqual(1 * CELL_SIZE + 1e-6);
  });
});
