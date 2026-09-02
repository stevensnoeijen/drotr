import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/types';
import { drawMoveLines } from './move-lines';

describe('drawMoveLines', () => {
  it('clears the graphics and draws nothing when no entity has a moveTarget', () => {
    const graphics = new Graphics();
    const clearSpy = graphics.clear.bind(graphics);
    let cleared = false;
    graphics.clear = (...args) => {
      cleared = true;
      return clearSpy(...args);
    };

    const entities: Entity[] = [
      { transform: { position: { x: 0, y: 0 }, rotation: 0 } },
    ];

    drawMoveLines(graphics, entities);

    expect(cleared).toBe(true);
  });

  it('draws a line for an entity with an active moveTarget without throwing', () => {
    const graphics = new Graphics();
    const entity: Entity = {
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      moveTarget: { position: { x: 64, y: 0 } },
    };

    expect(() => drawMoveLines(graphics, [entity])).not.toThrow();
  });

  it('skips an entity whose moveTarget has been cleared', () => {
    const graphics = new Graphics();
    let lineToCalled = false;
    const original = graphics.lineTo.bind(graphics);
    graphics.lineTo = (x: number, y: number) => {
      lineToCalled = true;
      return original(x, y);
    };

    const entity: Entity = {
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
    };

    drawMoveLines(graphics, [entity]);

    expect(lineToCalled).toBe(false);
  });
});
