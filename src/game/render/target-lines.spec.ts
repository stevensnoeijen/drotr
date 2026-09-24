import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { DEFAULT_CELL_SIZE, cellCentreCoordinate } from '~/lib/grid';
import { NO_CELL } from '~/game/navigation/occupancy-grid';
import { drawTargetLines } from './target-lines';

/**
 * A unit's resting position: the centre of cell (`col`, `row`). A line is
 * only drawn for a pair that is *settled*, and standing on the cell centre is
 * part of what that means, so every fixture here has to be placed the
 * way a real unit comes to rest.
 */
const centre = (col: number, row = 0) => ({
  x: cellCentreCoordinate(col, DEFAULT_CELL_SIZE),
  y: cellCentreCoordinate(row, DEFAULT_CELL_SIZE),
});

describe('drawTargetLines', () => {
  it('clears the graphics and draws nothing when no entity has a target', () => {
    const graphics = new Graphics();
    const clearSpy = graphics.clear.bind(graphics);
    let cleared = false;
    graphics.clear = (...args) => {
      cleared = true;
      return clearSpy(...args);
    };

    const entities: Entity[] = [
      { transform: { position: centre(0), rotation: 0 }, team: 'blue' },
    ];

    drawTargetLines(graphics, entities, DEFAULT_CELL_SIZE);

    expect(cleared).toBe(true);
  });

  it('does not throw when a target references an entity outside the pool', () => {
    const graphics = new Graphics();
    const origin: Entity = {
      id: 1,
      transform: { position: centre(0), rotation: 0 },
      team: 'blue',
      target: { entityId: 999 },
    };

    expect(() => drawTargetLines(graphics, [origin], DEFAULT_CELL_SIZE)).not.toThrow();
  });

  it('resolves a target within the pool without throwing', () => {
    const graphics = new Graphics();
    const origin: Entity = {
      id: 1,
      transform: { position: centre(0), rotation: 0 },
      team: 'blue',
      target: { entityId: 2 },
    };
    const target: Entity = {
      id: 2,
      transform: { position: centre(2), rotation: 0 },
      team: 'red',
    };

    expect(() => drawTargetLines(graphics, [origin, target], DEFAULT_CELL_SIZE)).not.toThrow();
  });

  it('offsets the dash phase differently for two origins sharing the same path', () => {
    const graphics = new Graphics();
    const target: Entity = {
      id: 3,
      transform: { position: centre(6), rotation: 0 },
      team: 'red',
    };
    const originA: Entity = {
      id: 1,
      transform: { position: centre(0), rotation: 0 },
      team: 'blue',
      target: { entityId: 3 },
    };
    const originB: Entity = {
      id: 2,
      transform: { position: centre(0), rotation: 0 },
      team: 'blue',
      target: { entityId: 3 },
    };

    const moveToCallsFor = (entities: Entity[]) => {
      const calls: Array<[number, number]> = [];
      const original = graphics.moveTo.bind(graphics);
      graphics.moveTo = (x: number, y: number) => {
        calls.push([x, y]);
        return original(x, y);
      };
      drawTargetLines(graphics, entities, DEFAULT_CELL_SIZE);
      return calls;
    };

    const callsA = moveToCallsFor([originA, target]);
    const callsB = moveToCallsFor([originB, target]);

    expect(callsA).not.toEqual(callsB);
  });

  it('skips a pair where the origin is still mid-step between two cells', () => {
    const graphics = new Graphics();
    const target: Entity = {
      id: 2,
      transform: { position: centre(1), rotation: 0 },
      team: 'red',
    };
    const origin: Entity = {
      id: 1,
      transform: { position: centre(0), rotation: 0 },
      team: 'blue',
      attackRange: { value: 1 },
      target: { entityId: 2 },
      cellOccupancy: { occupantId: 0, cell: 0, reserved: 1, blockedFor: 0, rerouted: false },
    };

    const drawn: unknown[] = [];
    graphics.circle = ((...args: unknown[]) => {
      drawn.push(args);
      return graphics;
    }) as typeof graphics.circle;

    drawTargetLines(graphics, [origin, target], DEFAULT_CELL_SIZE);

    expect(drawn).toHaveLength(0);
  });

  it('skips a pair where the origin is at rest but part-way across its cell', () => {
    const graphics = new Graphics();
    const target: Entity = {
      id: 2,
      transform: { position: centre(1), rotation: 0 },
      team: 'red',
    };
    const origin: Entity = {
      id: 1,
      // Standing still, holding exactly one cell — and visibly off its
      // centre, which is the state the overlay must not draw from.
      transform: { position: { x: centre(0).x - 8, y: centre(0).y }, rotation: 0 },
      team: 'blue',
      attackRange: { value: 1 },
      target: { entityId: 2 },
      velocity: { x: 0, y: 0 },
      cellOccupancy: { occupantId: 0, cell: 0, reserved: NO_CELL, blockedFor: 0, rerouted: false },
    };

    const drawn: unknown[] = [];
    graphics.circle = ((...args: unknown[]) => {
      drawn.push(args);
      return graphics;
    }) as typeof graphics.circle;

    drawTargetLines(graphics, [origin, target], DEFAULT_CELL_SIZE);

    expect(drawn).toHaveLength(0);
  });

  it('skips a pair beyond the origin attackRange even when both are settled', () => {
    const graphics = new Graphics();
    const target: Entity = {
      id: 2,
      transform: { position: centre(5), rotation: 0 },
      team: 'red',
    };
    const origin: Entity = {
      id: 1,
      transform: { position: centre(0), rotation: 0 },
      team: 'blue',
      attackRange: { value: 1 },
      target: { entityId: 2 },
    };

    const drawn: unknown[] = [];
    graphics.circle = ((...args: unknown[]) => {
      drawn.push(args);
      return graphics;
    }) as typeof graphics.circle;

    drawTargetLines(graphics, [origin, target], DEFAULT_CELL_SIZE);

    expect(drawn).toHaveLength(0);
  });

  it('draws a line once both sides are settled and within the origin attackRange', () => {
    const graphics = new Graphics();
    const target: Entity = {
      id: 2,
      transform: { position: centre(1), rotation: 0 },
      team: 'red',
      cellOccupancy: { occupantId: 1, cell: 1, reserved: NO_CELL, blockedFor: 0, rerouted: false },
    };
    const origin: Entity = {
      id: 1,
      transform: { position: centre(0), rotation: 0 },
      team: 'blue',
      attackRange: { value: 1 },
      target: { entityId: 2 },
      cellOccupancy: { occupantId: 0, cell: 0, reserved: NO_CELL, blockedFor: 0, rerouted: false },
    };

    const drawn: unknown[] = [];
    graphics.circle = ((...args: unknown[]) => {
      drawn.push(args);
      return graphics;
    }) as typeof graphics.circle;

    drawTargetLines(graphics, [origin, target], DEFAULT_CELL_SIZE);

    expect(drawn).toHaveLength(1);
  });
});
