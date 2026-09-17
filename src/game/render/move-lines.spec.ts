import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { planMovePath } from '~/game/navigation/plan-move-path';
import { cellPositionToVector } from '~/lib/grid';
import type { CollisionGrid } from '~/lib/navigation/astar';
import { drawMoveLines } from './move-lines';

/** A fully open 10x10 collision grid — mirrors the fixture in `pending-move-order-system.spec.ts`. */
const openGrid: CollisionGrid = { width: 10, height: 10, collision: new Uint8Array(100) };

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

/** A `Graphics` that records every colour passed to `stroke`, in order. */
function trackStrokeColors() {
  const graphics = new Graphics();
  const colors: number[] = [];
  const original = graphics.stroke.bind(graphics);
  graphics.stroke = (options: Parameters<Graphics['stroke']>[0]) => {
    if (options && typeof options === 'object' && 'color' in options) {
      colors.push(options.color as number);
    }
    return original(options);
  };

  return { graphics, colors };
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

  it('does not throw for an entity with a pendingMoveOrder but no moveTarget (does not occur in practice — a staged order always has one — but must not crash)', () => {
    const { graphics, points } = trackLineTo();
    const entity: Entity = {
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      pendingMoveOrder: { destination: { x: 100, y: 50 } },
    };

    expect(() => drawMoveLines(graphics, [entity])).not.toThrow();
    expect(points).toEqual([]);
  });

  it('splices the in-flight leg and a preview of the pending reroute into one continuous line (no grid: straight-line preview) (#178)', () => {
    const { graphics, points } = trackLineTo();
    const entity: Entity = {
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      moveTarget: { position: { x: 64, y: 0 } },
      pendingMoveOrder: { destination: { x: 200, y: 200 } },
    };

    drawMoveLines(graphics, [entity]);

    // One continuous polyline: the exact in-flight destination, then
    // straight on to the pending destination (no grid to route through).
    expect(points).toEqual([
      { x: 64, y: 0 },
      { x: 200, y: 200 },
    ]);
  });

  it('draws the merged in-flight-leg-plus-preview line in a single colour', () => {
    const { graphics, colors } = trackStrokeColors();
    const entity: Entity = {
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      moveTarget: { position: { x: 64, y: 0 } },
      pendingMoveOrder: { destination: { x: 200, y: 200 } },
    };

    drawMoveLines(graphics, [entity]);

    // Exactly one stroke call — one line, not a separate "committed" vs
    // "pending" one — necessarily in one colour.
    expect(colors).toHaveLength(1);
  });

  it('previews a routed reroute (with a grid) from the exact in-flight destination, not the pending order alone', () => {
    const { graphics, points } = trackLineTo();
    const legTarget = cellPositionToVector(2, 2);
    const destination = cellPositionToVector(9, 3);
    const entity: Entity = {
      // Deliberately a stale live position: the preview must be planned
      // from `moveTarget.position` (the exact upcoming cell), not this.
      transform: { position: { x: 500, y: 500 }, rotation: 0 },
      moveTarget: { position: { x: legTarget.x, y: legTarget.y } },
      pendingMoveOrder: { destination: { x: destination.x, y: destination.y } },
    };

    drawMoveLines(graphics, [entity], openGrid);

    const expectedRoute = planMovePath(
      openGrid,
      { x: legTarget.x, y: legTarget.y },
      { x: destination.x, y: destination.y }
    );
    expect(expectedRoute.status).toBe('found');

    // The in-flight leg's exact destination, then the previewed route's
    // waypoints — one continuous line, not the pending destination alone.
    expect(points).toEqual([{ x: legTarget.x, y: legTarget.y }, ...expectedRoute.waypoints]);
  });

  it('falls back to the unchanged moveTarget + remaining movePath behaviour when there is no pendingMoveOrder', () => {
    const { graphics, points } = trackLineTo();
    const entity: Entity = {
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      moveTarget: { position: { x: 10, y: 10 } },
      movePath: {
        waypoints: [
          { x: 10, y: 10 },
          { x: 20, y: 40 },
        ],
        index: 1,
      },
    };

    drawMoveLines(graphics, [entity], openGrid);

    expect(points).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 40 },
    ]);
  });
});
