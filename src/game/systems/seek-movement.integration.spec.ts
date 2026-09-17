import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { cellSteps } from '~/game/combat/attack-cell';
import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import { CELL_SIZE, cellCentreCoordinate, isAtCellCentre } from '~/lib/grid';
import { createMovePathSystem } from './move-path-system';
import { createMoveTargetSystem } from './move-target-system';
import { createMoveVelocitySystem } from './move-velocity-system';
import { createSeekSystem } from './seek-system';

const centre = (col: number, row: number) => ({
  x: cellCentreCoordinate(col),
  y: cellCentreCoordinate(row),
});

const cellOf = (position: { x: number; y: number }) => ({
  x: Math.floor(position.x / CELL_SIZE),
  y: Math.floor(position.y / CELL_SIZE),
});

/**
 * Integration coverage for #131 and #201: `SeekSystem` driving the ordinary
 * move pipeline (`MovePathSystem` -> `MoveTargetSystem` -> `MoveVelocitySystem`)
 * tick by tick, the way `game-canvas.tsx` wires them.
 *
 * The headline of #201 is here: an attacker closing on a target comes to rest
 * *on a cell centre*, one cell from its target, rather than at whatever point
 * in open space a distance check ran out.
 */
describe('seek + move integration', () => {
  function setup(dt: number, range = 1) {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const seek = createSeekSystem(queries);
    const movePath = createMovePathSystem(queries);
    const moveTarget = createMoveTargetSystem(queries);
    const move = createMoveVelocitySystem(queries);

    const target = world.add({
      transform: { position: centre(10, 0), rotation: 0 },
      velocity: { x: 0, y: 0 },
    });
    const self = world.add({
      transform: { position: centre(0, 0), rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 3 * CELL_SIZE },
      attackRange: { value: range },
      target: { entityId: target.id! },
    });

    const tick = () => {
      seek(world, dt);
      movePath(world, dt);
      moveTarget(world, dt);
      move(world, dt);
    };

    return { self, target, tick };
  }

  it('closes on a stationary target and comes to rest on the cell centre next to it', () => {
    const dt = 1 / 60;
    const { self, target, tick } = setup(dt);

    // Enough ticks to fully close the distance and then settle.
    for (let i = 0; i < 600; i++) {
      tick();
    }

    // The cell immediately west of the target's — the nearest one it can
    // attack from — and exactly on its centre, not merely inside it.
    expect(self.transform.position).toEqual(centre(9, 0));
    expect(isAtCellCentre(self.transform.position)).toBe(true);
    expect(cellSteps(cellOf(self.transform.position), cellOf(target.transform.position))).toBe(1);
  });

  it('velocity is zero once it has arrived', () => {
    const dt = 1 / 60;
    const { self, tick } = setup(dt);

    for (let i = 0; i < 600; i++) {
      tick();
    }

    expect(self.velocity).toEqual({ x: 0, y: 0 });
  });

  it('never walks into the cell its target is standing in', () => {
    const dt = 1 / 60;
    const { self, target, tick } = setup(dt);

    for (let i = 0; i < 600; i++) {
      tick();
      expect(
        cellSteps(cellOf(self.transform.position), cellOf(target.transform.position))
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('is only ever off a cell centre while actually moving', () => {
    const dt = 1 / 60;
    const { self, tick } = setup(dt);

    for (let i = 0; i < 600; i++) {
      tick();
      const moving = self.velocity.x !== 0 || self.velocity.y !== 0;
      if (!moving) {
        expect(isAtCellCentre(self.transform.position)).toBe(true);
      }
    }
  });

  it('stops a ranged unit on the cell centre at the edge of its range, not in melee', () => {
    const dt = 1 / 60;
    // A crossbow soldier's reach: five cells, so it has no business closing
    // all the way to its target (#201).
    const { self, target, tick } = setup(dt, 5);

    for (let i = 0; i < 600; i++) {
      tick();
    }

    expect(self.transform.position).toEqual(centre(5, 0));
    expect(isAtCellCentre(self.transform.position)).toBe(true);
    expect(cellSteps(cellOf(self.transform.position), cellOf(target.transform.position))).toBe(5);
    expect(self.velocity).toEqual({ x: 0, y: 0 });
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
