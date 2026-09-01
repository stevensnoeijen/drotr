import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/types';
import { createQueries } from '~/game/ecs/world';
import { CELL_SIZE } from '~/lib/grid';
import { Vector2 } from '~/lib/math/Vector2';
import {
  selectAt,
  findHoverableUnitAt,
  moveSelectedTo,
  InputSystem,
  CLICK_MOVE_THRESHOLD,
} from './input-system';

function addUnit(world: World<Entity>, x: number, y: number, size = 20) {
  return world.add({
    transform: { position: { x, y }, rotation: 0 },
    renderable: { shape: 'circle', color: 0x66ccff, size },
    selectable: true,
  });
}

describe('selectAt', () => {
  it('selects the unit under the click point', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const unit = addUnit(world, 100, 100);

    selectAt(world, queries, new Vector2(105, 100));

    expect(unit.selected).toBe(true);
    expect([...queries.selected]).toEqual([unit]);
  });

  it('picks the nearest unit when two overlap', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    // Both units' 20-radius circles cover (110, 100): far is centered 15px
    // away, near only 5px away.
    const far = addUnit(world, 95, 100);
    const near = addUnit(world, 105, 100);

    selectAt(world, queries, new Vector2(110, 100));

    expect(near.selected).toBe(true);
    expect(far.selected).toBeUndefined();
    expect([...queries.selected]).toEqual([near]);
  });

  it('clears the previous selection when clicking empty ground', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const unit = addUnit(world, 100, 100);

    selectAt(world, queries, new Vector2(100, 100));
    expect(unit.selected).toBe(true);

    selectAt(world, queries, new Vector2(5000, 5000));

    expect(unit.selected).toBeUndefined();
    expect([...queries.selected]).toHaveLength(0);
  });

  it('selects on a click in the bounding box corner, outside the circular radius', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    // (114, 114) is 14px away on each axis (inside the 20x20 box) but
    // ~19.8px from center — just inside the box, just outside a 20-radius
    // circle, so this only selects with rect-shaped hit-testing.
    const unit = addUnit(world, 100, 100, 20);

    selectAt(world, queries, new Vector2(114, 114));

    expect(unit.selected).toBe(true);
  });

  it('does not select a click outside the bounding box', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const unit = addUnit(world, 100, 100, 20);

    selectAt(world, queries, new Vector2(121, 100));

    expect(unit.selected).toBeUndefined();
  });

  it('adds to the selection on a shift-click instead of replacing it', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const a = addUnit(world, 0, 0);
    const b = addUnit(world, 200, 200);

    selectAt(world, queries, new Vector2(0, 0));
    selectAt(world, queries, new Vector2(200, 200), true);

    expect(a.selected).toBe(true);
    expect(b.selected).toBe(true);
    expect(new Set(queries.selected)).toEqual(new Set([a, b]));
  });

  it('toggles an already-selected unit off on a shift-click', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const a = addUnit(world, 0, 0);
    const b = addUnit(world, 200, 200);

    selectAt(world, queries, new Vector2(0, 0));
    selectAt(world, queries, new Vector2(200, 200), true);
    selectAt(world, queries, new Vector2(200, 200), true);

    expect(a.selected).toBe(true);
    expect(b.selected).toBeUndefined();
    expect([...queries.selected]).toEqual([a]);
  });

  it('leaves the existing selection untouched on a shift-click that misses', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const a = addUnit(world, 0, 0);

    selectAt(world, queries, new Vector2(0, 0));
    selectAt(world, queries, new Vector2(5000, 5000), true);

    expect(a.selected).toBe(true);
    expect([...queries.selected]).toEqual([a]);
  });

  it('replaces the selection with the newly clicked unit', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const a = addUnit(world, 0, 0);
    const b = addUnit(world, 200, 200);

    selectAt(world, queries, new Vector2(0, 0));
    expect(a.selected).toBe(true);

    selectAt(world, queries, new Vector2(200, 200));

    expect(a.selected).toBeUndefined();
    expect(b.selected).toBe(true);
  });
});

function addTeamUnit(world: World<Entity>, team: Entity['team'], selected = false) {
  return world.add({
    transform: { position: { x: 0, y: 0 }, rotation: 0 },
    renderable: { shape: 'circle', color: 0x66ccff, size: 20 },
    selectable: true,
    team,
    selected: selected || undefined,
  });
}

describe('moveSelectedTo', () => {
  it('issues a move order to a selected blue unit, snapped to the cell center', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const unit = addTeamUnit(world, 'blue', true);

    moveSelectedTo(queries, new Vector2(300, 400));

    expect(unit.moveTarget).toEqual({ position: { x: 304, y: 400 } });
  });

  it('does nothing with an empty selection', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    addTeamUnit(world, 'blue', false);

    moveSelectedTo(queries, new Vector2(300, 400));

    expect([...queries.selected]).toHaveLength(0);
  });

  it('does nothing when only a red unit is selected', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const redUnit = addTeamUnit(world, 'red', true);

    moveSelectedTo(queries, new Vector2(300, 400));

    expect(redUnit.moveTarget).toBeUndefined();
  });

  it('issues a move order to every selected blue unit on a single right-click', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const a = addTeamUnit(world, 'blue', true);
    const b = addTeamUnit(world, 'blue', true);

    moveSelectedTo(queries, new Vector2(50, 60));

    expect(a.moveTarget).toEqual({ position: { x: 48, y: 48 } });
    expect(b.moveTarget).toEqual({ position: { x: 48, y: 48 } });
  });

  it('only moves the selected blue units, leaving a selected red unit alone', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const blueUnit = addTeamUnit(world, 'blue', true);
    const redUnit = addTeamUnit(world, 'red', true);

    moveSelectedTo(queries, new Vector2(10, 20));

    expect(blueUnit.moveTarget).toEqual({ position: { x: 16, y: 16 } });
    expect(redUnit.moveTarget).toBeUndefined();
  });

  it('replaces an in-progress move order with a new one on a second right-click', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const unit = addTeamUnit(world, 'blue', true);

    moveSelectedTo(queries, new Vector2(300, 400));
    expect(unit.moveTarget).toEqual({ position: { x: 304, y: 400 } });

    moveSelectedTo(queries, new Vector2(10, 20));

    expect(unit.moveTarget).toEqual({ position: { x: 16, y: 16 } });
  });

  describe('with a collision grid', () => {
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

    const wallWithGap = gridFrom(`
      ....#....
      ....#....
      ....#....
      ....#....
      .........
    `);

    it('routes the order around a wall instead of straight through it', () => {
      const world = new World<Entity>();
      const queries = createQueries(world);
      const unit = addTeamUnit(world, 'blue', true);
      unit.transform.position = { ...centre(0, 0) };

      moveSelectedTo(queries, new Vector2(centre(8, 0).x, centre(8, 0).y), wallWithGap);

      expect(unit.movePath).toEqual({
        index: 0,
        waypoints: [centre(3, 3), centre(4, 4), centre(5, 3), centre(8, 0)],
      });
      // The first leg is handed over by MovePathSystem, not here.
      expect(unit.moveTarget).toBeUndefined();
    });

    it('plans each selected unit its own route from where it stands', () => {
      const world = new World<Entity>();
      const queries = createQueries(world);
      const a = addTeamUnit(world, 'blue', true);
      const b = addTeamUnit(world, 'blue', true);
      a.transform.position = { ...centre(0, 0) };
      b.transform.position = { ...centre(0, 4) };

      moveSelectedTo(queries, new Vector2(centre(8, 4).x, centre(8, 4).y), wallWithGap);

      expect(a.movePath?.waypoints).not.toEqual(b.movePath?.waypoints);
      expect(a.movePath?.waypoints.at(-1)).toEqual(centre(8, 4));
      expect(b.movePath?.waypoints).toEqual([centre(8, 4)]);
    });

    it('leaves an unreachable order unissued rather than half-applied', () => {
      const divided = gridFrom(`
        ..#..
        ..#..
        ..#..
        ..#..
        ..#..
      `);
      const world = new World<Entity>();
      const queries = createQueries(world);
      const unit = addTeamUnit(world, 'blue', true);
      unit.transform.position = { ...centre(0, 0) };

      moveSelectedTo(queries, new Vector2(centre(4, 4).x, centre(4, 4).y), divided);

      expect(unit.movePath).toBeUndefined();
      expect(unit.moveTarget).toBeUndefined();
    });

    it('clears the previous leg so a new route starts from its first waypoint', () => {
      const world = new World<Entity>();
      const queries = createQueries(world);
      const unit = addTeamUnit(world, 'blue', true);
      unit.transform.position = { ...centre(0, 0) };
      unit.moveTarget = { position: { x: 999, y: 999 } };

      moveSelectedTo(queries, new Vector2(centre(8, 0).x, centre(8, 0).y), wallWithGap);

      expect(unit.moveTarget).toBeUndefined();
      expect(unit.movePath?.index).toBe(0);
    });

    it('drops a stale route when a later order falls back to a straight line', () => {
      const world = new World<Entity>();
      const queries = createQueries(world);
      const unit = addTeamUnit(world, 'blue', true);
      unit.transform.position = { ...centre(0, 0) };

      moveSelectedTo(queries, new Vector2(centre(8, 0).x, centre(8, 0).y), wallWithGap);
      moveSelectedTo(queries, new Vector2(10, 20));

      expect(unit.movePath).toBeUndefined();
      expect(unit.moveTarget).toEqual({ position: { x: 16, y: 16 } });
    });

    it('still refuses to route a selected red unit', () => {
      const world = new World<Entity>();
      const queries = createQueries(world);
      addTeamUnit(world, 'blue', true);
      const redUnit = addTeamUnit(world, 'red', true);

      moveSelectedTo(queries, new Vector2(centre(8, 0).x, centre(8, 0).y), wallWithGap);

      expect(redUnit.movePath).toBeUndefined();
      expect(redUnit.moveTarget).toBeUndefined();
    });
  });
});

describe('InputSystem', () => {
  function makeCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect;
    document.body.appendChild(canvas);
    return canvas;
  }

  it('suppresses the browser context menu on right-click', () => {
    const canvas = makeCanvas();
    const input = new InputSystem(canvas);

    const event = new MouseEvent('contextmenu', {
      clientX: 100,
      clientY: 100,
      cancelable: true,
    });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    input.dispose();
  });

  it('queues a move order from a contextmenu event, converted to canvas-relative coordinates', () => {
    const canvas = makeCanvas();
    const input = new InputSystem(canvas);

    canvas.dispatchEvent(
      new MouseEvent('contextmenu', { clientX: 150, clientY: 120, cancelable: true })
    );

    expect(input.drainMoveOrders()).toEqual([{ x: 150, y: 120 }]);
    input.dispose();
  });

  it('a right-button pointerdown/up does not queue a left-click selection', () => {
    const canvas = makeCanvas();
    const input = new InputSystem(canvas);

    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 2 })
    );
    window.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 100, clientY: 100, button: 2 })
    );

    expect(input.drain()).toEqual([]);
    input.dispose();
  });

  it('left-click selection (single click) still queues normally alongside right-click handling', () => {
    const canvas = makeCanvas();
    const input = new InputSystem(canvas);

    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 50, clientY: 50, button: 0 })
    );
    window.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 50, clientY: 50, button: 0 })
    );

    expect(input.drain()).toEqual([{ x: 50, y: 50, shiftKey: false }]);
    input.dispose();
  });

  it('left-click drag-select gesture is unaffected: pointerdown/up beyond the click threshold queues no click', () => {
    const canvas = makeCanvas();
    const input = new InputSystem(canvas);

    canvas.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 0, clientY: 0, button: 0 })
    );
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: CLICK_MOVE_THRESHOLD + 10,
        clientY: 0,
        button: 0,
      })
    );

    expect(input.drain()).toEqual([]);
    input.dispose();
  });
});

describe('findHoverableUnitAt', () => {
  it('finds a hoverable unit at the given position', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const unit = world.add({
      transform: { position: { x: 100, y: 100 }, rotation: 0 },
      renderable: { shape: 'circle', color: 0x66ccff, size: 20 },
      hoverable: true,
    });

    const found = findHoverableUnitAt(queries, new Vector2(105, 100));

    expect(found).toBe(unit);
  });

  it('finds non-selectable (red) units that are hoverable', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const redUnit = world.add({
      transform: { position: { x: 100, y: 100 }, rotation: 0 },
      renderable: { shape: 'circle', color: 0xff6b6b, size: 20 },
      hoverable: true,
      team: 'red',
      // Note: no 'selectable' component (red units are not selectable by player)
    });

    const found = findHoverableUnitAt(queries, new Vector2(105, 100));

    expect(found).toBe(redUnit);
  });

  it('finds the nearest hoverable unit when multiple overlap', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    world.add({
      transform: { position: { x: 95, y: 100 }, rotation: 0 },
      renderable: { shape: 'circle', color: 0x66ccff, size: 20 },
      hoverable: true,
    });
    const near = world.add({
      transform: { position: { x: 105, y: 100 }, rotation: 0 },
      renderable: { shape: 'circle', color: 0xff6b6b, size: 20 },
      hoverable: true,
      team: 'red',
    });

    const found = findHoverableUnitAt(queries, new Vector2(110, 100));

    expect(found).toBe(near);
  });

  it('returns undefined when no hoverable unit is at the position', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    world.add({
      transform: { position: { x: 100, y: 100 }, rotation: 0 },
      renderable: { shape: 'circle', color: 0x66ccff, size: 20 },
      hoverable: true,
    });

    const found = findHoverableUnitAt(queries, new Vector2(5000, 5000));

    expect(found).toBeUndefined();
  });
});
