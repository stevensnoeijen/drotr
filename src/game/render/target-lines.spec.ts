import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/types';
import { drawTargetLines } from './target-lines';

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
      { transform: { position: { x: 0, y: 0 }, rotation: 0 }, team: 'blue' },
    ];

    drawTargetLines(graphics, entities);

    expect(cleared).toBe(true);
  });

  it('does not throw when a target references an entity outside the pool', () => {
    const graphics = new Graphics();
    const origin: Entity = {
      id: 1,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      team: 'blue',
      target: { entityId: 999 },
    };

    expect(() => drawTargetLines(graphics, [origin])).not.toThrow();
  });

  it('resolves a target within the pool without throwing', () => {
    const graphics = new Graphics();
    const origin: Entity = {
      id: 1,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      team: 'blue',
      target: { entityId: 2 },
    };
    const target: Entity = {
      id: 2,
      transform: { position: { x: 64, y: 0 }, rotation: 0 },
      team: 'red',
    };

    expect(() => drawTargetLines(graphics, [origin, target])).not.toThrow();
  });

  it('offsets the dash phase differently for two origins sharing the same path', () => {
    const graphics = new Graphics();
    const target: Entity = {
      id: 3,
      transform: { position: { x: 200, y: 0 }, rotation: 0 },
      team: 'red',
    };
    const originA: Entity = {
      id: 1,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      team: 'blue',
      target: { entityId: 3 },
    };
    const originB: Entity = {
      id: 2,
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
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
      drawTargetLines(graphics, entities);
      return calls;
    };

    const callsA = moveToCallsFor([originA, target]);
    const callsB = moveToCallsFor([originB, target]);

    expect(callsA).not.toEqual(callsB);
  });
});
