import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/types';
import { drawMoveLines } from './move-lines';

/**
 * A `Graphics` that records every `lineTo` the renderer issues, in order —
 * i.e. the polyline actually drawn, minus the `moveTo` that starts it at the
 * unit's own position.
 */
function trackLineTo() {
  const graphics = new Graphics();
  const points: { x: number; y: number }[] = [];
  const original = graphics.lineTo.bind(graphics);
  graphics.lineTo = (x: number, y: number) => {
    points.push({ x, y });
    return original(x, y);
  };

  return { graphics, points };
}

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
    const { graphics, points } = trackLineTo();

    const entity: Entity = {
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
    };

    drawMoveLines(graphics, [entity]);

    expect(points).toEqual([]);
  });

  it('draws a single segment for a straight-line order with no route', () => {
    const { graphics, points } = trackLineTo();
    const entity: Entity = {
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      moveTarget: { position: { x: 64, y: 0 } },
    };

    drawMoveLines(graphics, [entity]);

    expect(points).toEqual([{ x: 64, y: 0 }]);
  });

  it('draws a segment per remaining waypoint of a routed path', () => {
    const { graphics, points } = trackLineTo();
    const entity: Entity = {
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      moveTarget: { position: { x: 10, y: 10 } },
      movePath: {
        waypoints: [
          { x: 10, y: 10 },
          { x: 20, y: 40 },
          { x: 60, y: 40 },
        ],
        index: 1,
      },
    };

    drawMoveLines(graphics, [entity]);

    // The unit's own position starts the polyline (a `moveTo`), then the leg
    // it's walking and the two waypoints still ahead of it — each waypoint
    // exactly once, since `index` is the *next* one to be handed over.
    expect(points).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 40 },
      { x: 60, y: 40 },
    ]);
  });

  it('does not redraw waypoints the unit has already walked past', () => {
    const { graphics, points } = trackLineTo();
    const entity: Entity = {
      transform: { position: { x: 30, y: 40 }, rotation: 0 },
      moveTarget: { position: { x: 60, y: 40 } },
      movePath: {
        waypoints: [
          { x: 10, y: 10 },
          { x: 20, y: 40 },
          { x: 60, y: 40 },
        ],
        index: 3,
      },
    };

    drawMoveLines(graphics, [entity]);

    expect(points).toEqual([{ x: 60, y: 40 }]);
  });

  it('draws a route whose first leg has not been handed over yet', () => {
    const { graphics, points } = trackLineTo();
    const entity: Entity = {
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      movePath: {
        waypoints: [
          { x: 10, y: 10 },
          { x: 20, y: 40 },
        ],
        index: 0,
      },
    };

    drawMoveLines(graphics, [entity]);

    expect(points).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 40 },
    ]);
  });

  it('skips an entity with no transform', () => {
    const { graphics, points } = trackLineTo();

    drawMoveLines(graphics, [{ moveTarget: { position: { x: 1, y: 2 } } }]);

    expect(points).toEqual([]);
  });
});
