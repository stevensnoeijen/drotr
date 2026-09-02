import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { createMovePathSystem } from './move-path-system';

function setup(entity: Partial<Entity> = {}) {
  const world = new World<Entity>();
  const queries = createQueries(world);
  const system = createMovePathSystem(queries);

  const self = world.add({
    transform: { position: { x: 0, y: 0 }, rotation: 0 },
    velocity: { x: 0, y: 0 },
    moveSpeed: { value: 100 },
    ...entity,
  });

  return { world, self, tick: () => system(world, 1 / 60) };
}

describe('createMovePathSystem', () => {
  it('hands the first waypoint over as the move target', () => {
    const { self, tick } = setup({
      movePath: { waypoints: [{ x: 10, y: 20 }, { x: 30, y: 40 }], index: 0 },
    });

    tick();

    expect(self.moveTarget).toEqual({ position: { x: 10, y: 20 } });
    expect(self.movePath?.index).toBe(1);
  });

  it('leaves an in-progress leg alone', () => {
    const { self, tick } = setup({
      moveTarget: { position: { x: 10, y: 20 } },
      movePath: { waypoints: [{ x: 10, y: 20 }, { x: 30, y: 40 }], index: 1 },
    });

    tick();

    expect(self.moveTarget).toEqual({ position: { x: 10, y: 20 } });
    expect(self.movePath?.index).toBe(1);
  });

  it('advances to the next waypoint once the current leg is done', () => {
    const { self, tick } = setup({
      movePath: { waypoints: [{ x: 10, y: 20 }, { x: 30, y: 40 }], index: 0 },
    });

    tick();
    delete self.moveTarget;
    tick();

    expect(self.moveTarget).toEqual({ position: { x: 30, y: 40 } });
    expect(self.movePath?.index).toBe(2);
  });

  it('drops the path once every waypoint has been walked', () => {
    const { self, tick } = setup({
      movePath: { waypoints: [{ x: 10, y: 20 }], index: 0 },
    });

    tick();
    delete self.moveTarget;
    tick();

    expect(self.movePath).toBeUndefined();
    expect(self.moveTarget).toBeUndefined();
  });

  it('copies the waypoint rather than aliasing it into the move target', () => {
    const waypoint = { x: 10, y: 20 };
    const { self, tick } = setup({ movePath: { waypoints: [waypoint], index: 0 } });

    tick();
    self.moveTarget!.position.x = 99;

    expect(waypoint).toEqual({ x: 10, y: 20 });
  });

  it('drops an empty path without ever setting a move target', () => {
    const { self, tick } = setup({ movePath: { waypoints: [], index: 0 } });

    tick();

    expect(self.movePath).toBeUndefined();
    expect(self.moveTarget).toBeUndefined();
  });

  it('ignores entities with no path at all', () => {
    const { self, tick } = setup();

    tick();

    expect(self.moveTarget).toBeUndefined();
  });
});
