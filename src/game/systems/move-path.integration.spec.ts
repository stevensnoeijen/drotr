import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { CELL_SIZE, toGridPosition } from '~/lib/grid';
import { Vector2 } from '~/lib/math/vector2';
import { isWalkable } from '~/lib/navigation/astar';
import { moveSelectedTo } from './input-system';
import { createMovePathSystem } from './move-path-system';
import { ARRIVAL_TOLERANCE, createMoveTargetSystem } from './move-target-system';
import { createMoveVelocitySystem } from './move-velocity-system';
import { createPendingMoveOrderSystem } from './pending-move-order-system';

/** A collision grid in the exact shape a loaded map exposes. */
const gridFrom = (art: string) => {
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
};

const centre = (col: number, row: number) => ({
  x: col * CELL_SIZE + CELL_SIZE / 2,
  y: row * CELL_SIZE + CELL_SIZE / 2,
});

/**
 * Integration coverage for a right-click move order routed by A* and
 * then actually walked, tick by tick, through the same three systems
 * `game-canvas.tsx` wires in this order — path, target, velocity.
 */
describe('move order + path + movement integration', () => {
  const wallWithGap = gridFrom(`
    ....#....
    ....#....
    ....#....
    ....#....
    .........
  `);

  function setup() {
    const dt = 1 / 60;
    const world = new World<Entity>();
    const queries = createQueries(world);
    const pendingOrder = createPendingMoveOrderSystem(queries, wallWithGap);
    const path = createMovePathSystem(queries);
    const target = createMoveTargetSystem(queries);
    const move = createMoveVelocitySystem(queries);

    const unit = world.add({
      transform: { position: { ...centre(0, 0) }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 4 * CELL_SIZE },
      team: 'blue',
      selectable: true,
      selected: true,
    });

    const tick = () => {
      pendingOrder(world, dt);
      path(world, dt);
      target(world, dt);
      move(world, dt);
    };

    return { queries, unit, tick };
  }

  it('walks around the wall to the destination without ever entering it', () => {
    const { queries, unit, tick } = setup();
    const destination = centre(8, 0);

    moveSelectedTo(queries, new Vector2(destination.x, destination.y), wallWithGap);

    expect(unit.movePath?.waypoints.at(-1)).toEqual(destination);

    for (let i = 0; i < 1200; i++) {
      tick();
      const cell = toGridPosition(
        new Vector2(unit.transform.position.x, unit.transform.position.y),
        CELL_SIZE
      );
      expect(isWalkable(wallWithGap, cell.x, cell.y)).toBe(true);
    }

    expect(unit.transform.position.x).toBeCloseTo(destination.x, 5);
    expect(unit.transform.position.y).toBeCloseTo(destination.y, 5);
  });

  it('comes to rest with no order left once it arrives', () => {
    const { queries, unit, tick } = setup();

    moveSelectedTo(queries, new Vector2(centre(8, 0).x, centre(8, 0).y), wallWithGap);
    for (let i = 0; i < 1200; i++) {
      tick();
    }

    expect(unit.movePath).toBeUndefined();
    expect(unit.moveTarget).toBeUndefined();
    expect(unit.velocity).toEqual({ x: 0, y: 0 });
  });

  it('visits every waypoint of the route, in order', () => {
    const { queries, unit, tick } = setup();

    moveSelectedTo(queries, new Vector2(centre(8, 0).x, centre(8, 0).y), wallWithGap);
    const waypoints = [...unit.movePath!.waypoints];

    const reached: number[] = [];
    for (let i = 0; i < 1200; i++) {
      tick();
      waypoints.forEach((waypoint, index) => {
        if (reached.includes(index)) {
          return;
        }
        const distance = Math.hypot(
          waypoint.x - unit.transform.position.x,
          waypoint.y - unit.transform.position.y
        );
        if (distance <= 1) {
          reached.push(index);
        }
      });
    }

    expect(reached).toEqual(waypoints.map((_, index) => index));
  });

  it('stages a second order given mid-walk, applying it once the in-progress leg finishes', () => {
    const { queries, unit, tick } = setup();

    moveSelectedTo(queries, new Vector2(centre(8, 0).x, centre(8, 0).y), wallWithGap);
    for (let i = 0; i < 60; i++) {
      tick();
    }

    // Still mid-transition toward the leg it already committed to: a new
    // order here must not redirect it immediately, which would change its
    // direction of travel mid-cell.
    const previousMoveTarget = { ...unit.moveTarget!.position };
    const destination = centre(0, 4);
    moveSelectedTo(queries, new Vector2(destination.x, destination.y), wallWithGap);

    expect(unit.moveTarget).toEqual({ position: previousMoveTarget });
    expect(unit.pendingMoveOrder).toBeDefined();

    // Extra headroom over the usual 1200 ticks: the order only starts being
    // walked once the leg already in progress finishes.
    for (let i = 0; i < 2400; i++) {
      tick();
    }

    // The staged order still takes effect eventually, once the unit is free
    // to receive it. The final leg starts from wherever the interrupted leg
    // left off rather than a cell boundary, so arrival is only guaranteed
    // within ARRIVAL_TOLERANCE rather than exactly at the destination.
    const distance = Math.hypot(
      unit.transform.position.x - destination.x,
      unit.transform.position.y - destination.y
    );
    expect(distance).toBeLessThanOrEqual(ARRIVAL_TOLERANCE);
  });

  it('stages a stop order given mid-walk, only halting once the in-progress leg finishes', () => {
    const { queries, unit, tick } = setup();

    moveSelectedTo(queries, new Vector2(centre(8, 0).x, centre(8, 0).y), wallWithGap);
    for (let i = 0; i < 60; i++) {
      tick();
    }
    expect(unit.velocity).not.toEqual({ x: 0, y: 0 });

    // Order a stop at the cell the unit's current leg is already headed
    // toward — once it arrives there, the destination and its position
    // coincide, so the staged order resolves to a stop.
    const legTarget = { ...unit.moveTarget!.position };
    moveSelectedTo(queries, new Vector2(legTarget.x, legTarget.y), wallWithGap);

    // Still mid-transition: the stop order is staged, not applied yet, so
    // the unit keeps moving toward the cell it already committed to.
    expect(unit.pendingMoveOrder).toEqual({ destination: legTarget });
    expect(unit.velocity).not.toEqual({ x: 0, y: 0 });

    for (let i = 0; i < 1200; i++) {
      tick();
    }

    expect(unit.movePath).toBeUndefined();
    expect(unit.moveTarget).toBeUndefined();
    expect(unit.velocity).toEqual({ x: 0, y: 0 });
    expect(unit.pendingMoveOrder).toBeUndefined();

    // And it stays stopped: nothing left to integrate it forward.
    const stoppedAt = { ...unit.transform.position };
    for (let i = 0; i < 60; i++) {
      tick();
    }
    expect(unit.transform.position).toEqual(stoppedAt);
  });

  it('leaves a unit untouched when the destination is unreachable', () => {
    const divided = gridFrom(`
      ..#..
      ..#..
      ..#..
      ..#..
      ..#..
    `);
    const { queries, unit, tick } = setup();
    const start = { ...unit.transform.position };

    moveSelectedTo(queries, new Vector2(centre(4, 4).x, centre(4, 4).y), divided);
    for (let i = 0; i < 60; i++) {
      tick();
    }

    expect(unit.movePath).toBeUndefined();
    expect(unit.moveTarget).toBeUndefined();
    expect(unit.transform.position).toEqual(start);
  });
});
