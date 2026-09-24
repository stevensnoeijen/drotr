import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { DEFAULT_CELL_SIZE } from '~/lib/grid';
import { Vector2 } from '~/lib/math/vector2';
import {
  attackSelectedTarget,
  createInputSystem,
  findEnemyUnitAt,
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

  it('does not select a dead unit under the click point', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const unit = addUnit(world, 100, 100);
    world.addComponent(unit, 'dead', { elapsed: 0 });

    selectAt(world, queries, new Vector2(105, 100));

    expect(unit.selected).toBeUndefined();
    expect([...queries.selected]).toHaveLength(0);
  });

  it('a plain click that only hits a dead unit is treated as a miss, clearing the selection like any other miss', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const live = addUnit(world, 0, 0);
    const dead = addUnit(world, 200, 200);
    world.addComponent(dead, 'dead', { elapsed: 0 });

    selectAt(world, queries, new Vector2(0, 0));
    expect(live.selected).toBe(true);

    selectAt(world, queries, new Vector2(200, 200));

    expect(live.selected).toBeUndefined();
    expect(dead.selected).toBeUndefined();
    expect([...queries.selected]).toHaveLength(0);
  });

  it('does not shift-click-add a dead unit to the selection', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const live = addUnit(world, 0, 0);
    const dead = addUnit(world, 200, 200);
    world.addComponent(dead, 'dead', { elapsed: 0 });

    selectAt(world, queries, new Vector2(0, 0));
    selectAt(world, queries, new Vector2(200, 200), true);

    expect(live.selected).toBe(true);
    expect(dead.selected).toBeUndefined();
    expect([...queries.selected]).toEqual([live]);
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

    moveSelectedTo(queries, new Vector2(300, 400), DEFAULT_CELL_SIZE);

    expect(unit.moveTarget).toEqual({ position: { x: 304, y: 400 } });
  });

  it('does nothing with an empty selection', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    addTeamUnit(world, 'blue', false);

    moveSelectedTo(queries, new Vector2(300, 400), DEFAULT_CELL_SIZE);

    expect([...queries.selected]).toHaveLength(0);
  });

  it('does nothing when only a red unit is selected', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const redUnit = addTeamUnit(world, 'red', true);

    moveSelectedTo(queries, new Vector2(300, 400), DEFAULT_CELL_SIZE);

    expect(redUnit.moveTarget).toBeUndefined();
  });

  it('issues a move order to every selected blue unit on a single right-click', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const a = addTeamUnit(world, 'blue', true);
    const b = addTeamUnit(world, 'blue', true);

    moveSelectedTo(queries, new Vector2(50, 60), DEFAULT_CELL_SIZE);

    expect(a.moveTarget).toEqual({ position: { x: 48, y: 48 } });
    expect(b.moveTarget).toEqual({ position: { x: 48, y: 48 } });
  });

  it('only moves the selected blue units, leaving a selected red unit alone', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const blueUnit = addTeamUnit(world, 'blue', true);
    const redUnit = addTeamUnit(world, 'red', true);

    moveSelectedTo(queries, new Vector2(10, 20), DEFAULT_CELL_SIZE);

    expect(blueUnit.moveTarget).toEqual({ position: { x: 16, y: 16 } });
    expect(redUnit.moveTarget).toBeUndefined();
  });

  it('stages a second right-click instead of redirecting a unit still mid-transition', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const unit = addTeamUnit(world, 'blue', true);

    moveSelectedTo(queries, new Vector2(300, 400), DEFAULT_CELL_SIZE);
    expect(unit.moveTarget).toEqual({ position: { x: 304, y: 400 } });

    // The unit hasn't arrived (MoveTargetSystem never ran), so it's still
    // mid-transition: a new order here must not redirect it immediately —
    // that would change its direction mid-cell, which is disallowed.
    moveSelectedTo(queries, new Vector2(10, 20), DEFAULT_CELL_SIZE);

    expect(unit.moveTarget).toEqual({ position: { x: 304, y: 400 } });
    // Only the destination is staged — not a route planned from the unit's
    // current (still mid-transition) position — so it can be (re)planned
    // from wherever the unit actually ends up once free to receive it.
    expect(unit.pendingMoveOrder).toEqual({ destination: { x: 16, y: 16 } });
  });

  it('applies a move order immediately once the unit is no longer mid-transition', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const unit = addTeamUnit(world, 'blue', true);

    moveSelectedTo(queries, new Vector2(300, 400), DEFAULT_CELL_SIZE);
    // Simulate arrival: MoveTargetSystem clears MoveTarget once the unit
    // reaches it.
    delete unit.moveTarget;

    moveSelectedTo(queries, new Vector2(10, 20), DEFAULT_CELL_SIZE);

    expect(unit.moveTarget).toEqual({ position: { x: 16, y: 16 } });
    expect(unit.pendingMoveOrder).toBeUndefined();
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
      x: col * DEFAULT_CELL_SIZE + DEFAULT_CELL_SIZE / 2,
      y: row * DEFAULT_CELL_SIZE + DEFAULT_CELL_SIZE / 2,
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

      moveSelectedTo(
        queries,
        new Vector2(centre(8, 0).x, centre(8, 0).y),
        DEFAULT_CELL_SIZE,
        wallWithGap
      );

      expect(unit.movePath).toEqual({
        index: 0,
        waypoints: [
          centre(1, 1),
          centre(2, 2),
          centre(3, 3),
          centre(3, 4),
          centre(4, 4),
          centre(5, 4),
          centre(6, 3),
          centre(7, 2),
          centre(8, 1),
          centre(8, 0),
        ],
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

      moveSelectedTo(
        queries,
        new Vector2(centre(8, 4).x, centre(8, 4).y),
        DEFAULT_CELL_SIZE,
        wallWithGap
      );

      expect(a.movePath?.waypoints).not.toEqual(b.movePath?.waypoints);
      expect(a.movePath?.waypoints.at(-1)).toEqual(centre(8, 4));
      expect(b.movePath?.waypoints).toEqual([
        centre(1, 4),
        centre(2, 4),
        centre(3, 4),
        centre(4, 4),
        centre(5, 4),
        centre(6, 4),
        centre(7, 4),
        centre(8, 4),
      ]);
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

      moveSelectedTo(
        queries,
        new Vector2(centre(4, 4).x, centre(4, 4).y),
        DEFAULT_CELL_SIZE,
        divided
      );

      expect(unit.movePath).toBeUndefined();
      expect(unit.moveTarget).toBeUndefined();
    });

    it('stages just the destination rather than a route planned now, so the in-progress leg is left alone', () => {
      const world = new World<Entity>();
      const queries = createQueries(world);
      const unit = addTeamUnit(world, 'blue', true);
      unit.transform.position = { ...centre(0, 0) };
      unit.moveTarget = { position: { x: 999, y: 999 } };

      moveSelectedTo(
        queries,
        new Vector2(centre(8, 0).x, centre(8, 0).y),
        DEFAULT_CELL_SIZE,
        wallWithGap
      );

      // Still mid-transition toward the leg it already committed to: the new
      // order must not take over yet, and must not be planned from the
      // unit's current (still mid-transition) position either — that's
      // deferred to PendingMoveOrderSystem, once the unit is actually
      // standing wherever this leg ends up.
      expect(unit.moveTarget).toEqual({ position: { x: 999, y: 999 } });
      expect(unit.movePath).toBeUndefined();
      expect(unit.pendingMoveOrder).toEqual({ destination: centre(8, 0) });
    });

    it('drops a stale route when a later order falls back to a straight line', () => {
      const world = new World<Entity>();
      const queries = createQueries(world);
      const unit = addTeamUnit(world, 'blue', true);
      unit.transform.position = { ...centre(0, 0) };

      moveSelectedTo(
        queries,
        new Vector2(centre(8, 0).x, centre(8, 0).y),
        DEFAULT_CELL_SIZE,
        wallWithGap
      );
      moveSelectedTo(queries, new Vector2(10, 20), DEFAULT_CELL_SIZE);

      expect(unit.movePath).toBeUndefined();
      expect(unit.moveTarget).toEqual({ position: { x: 16, y: 16 } });
    });

    it('still refuses to route a selected red unit', () => {
      const world = new World<Entity>();
      const queries = createQueries(world);
      addTeamUnit(world, 'blue', true);
      const redUnit = addTeamUnit(world, 'red', true);

      moveSelectedTo(
        queries,
        new Vector2(centre(8, 0).x, centre(8, 0).y),
        DEFAULT_CELL_SIZE,
        wallWithGap
      );

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

/** A combatant on `team`, hit-testable at (`x`, `y`). */
function addCombatant(
  world: World<Entity>,
  team: Entity['team'],
  x: number,
  y: number,
  id: number
) {
  return world.add({
    id,
    transform: { position: { x, y }, rotation: 0 },
    renderable: { shape: 'circle' as const, color: 0xff6b6b, size: 13 },
    team,
    health: { current: 10, max: 10 },
    velocity: { x: 0, y: 0 },
  });
}

describe('findEnemyUnitAt', () => {
  it('finds a red unit under the click point', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const enemy = addCombatant(world, 'red', 100, 100, 1);

    expect(findEnemyUnitAt(queries, new Vector2(105, 100))).toBe(enemy);
  });

  it('ignores the player\'s own units', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    addCombatant(world, 'blue', 100, 100, 1);

    expect(findEnemyUnitAt(queries, new Vector2(100, 100))).toBeUndefined();
  });

  it('ignores a corpse awaiting cleanup', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const enemy = addCombatant(world, 'red', 100, 100, 1);
    enemy.health!.current = 0;

    expect(findEnemyUnitAt(queries, new Vector2(100, 100))).toBeUndefined();
  });

  it('ignores an enemy with no id for a Target to reference', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    world.add({
      transform: { position: { x: 100, y: 100 }, rotation: 0 },
      renderable: { shape: 'circle' as const, color: 0xff6b6b, size: 13 },
      team: 'red' as const,
      health: { current: 10, max: 10 },
    });

    expect(findEnemyUnitAt(queries, new Vector2(100, 100))).toBeUndefined();
  });

  it('picks the nearest of two overlapping enemies', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const far = addCombatant(world, 'red', 95, 100, 1);
    const near = addCombatant(world, 'red', 105, 100, 2);

    expect(findEnemyUnitAt(queries, new Vector2(107, 100))).toBe(near);
    expect(far.id).toBe(1);
  });

  it('returns nothing for a click on empty ground', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    addCombatant(world, 'red', 100, 100, 1);

    expect(findEnemyUnitAt(queries, new Vector2(5000, 5000))).toBeUndefined();
  });
});

describe('attackSelectedTarget', () => {
  it('gives every selected blue unit a sticky manual target', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const a = addTeamUnit(world, 'blue', true);
    const b = addTeamUnit(world, 'blue', true);
    const enemy = addCombatant(world, 'red', 500, 500, 9);

    attackSelectedTarget(queries, enemy);

    expect(a.target).toEqual({ entityId: 9, manual: true });
    expect(b.target).toEqual({ entityId: 9, manual: true });
  });

  it('issues no move order: reaching the target is SeekSystem\'s job', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const unit = addTeamUnit(world, 'blue', true);
    const enemy = addCombatant(world, 'red', 500, 500, 9);

    attackSelectedTarget(queries, enemy);

    expect(unit.moveTarget).toBeUndefined();
    expect(unit.movePath).toBeUndefined();
    expect(unit.pendingMoveOrder).toBeUndefined();
  });

  it('replaces a move order the unit was already carrying', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const unit = addTeamUnit(world, 'blue', true);
    const enemy = addCombatant(world, 'red', 500, 500, 9);

    moveSelectedTo(queries, new Vector2(300, 400), DEFAULT_CELL_SIZE);
    expect(unit.moveTarget).toBeDefined();

    attackSelectedTarget(queries, enemy);

    expect(unit.moveTarget).toBeUndefined();
    expect(unit.target).toEqual({ entityId: 9, manual: true });
  });

  it('does nothing when only a red unit is selected', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const redUnit = addTeamUnit(world, 'red', true);
    const enemy = addCombatant(world, 'red', 500, 500, 9);

    attackSelectedTarget(queries, enemy);

    expect(redUnit.target).toBeUndefined();
  });

  it('does nothing with an empty selection', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const unit = addTeamUnit(world, 'blue', false);
    const enemy = addCombatant(world, 'red', 500, 500, 9);

    attackSelectedTarget(queries, enemy);

    expect(unit.target).toBeUndefined();
  });

  it('only orders the selected blue units, leaving a selected red unit alone', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const blueUnit = addTeamUnit(world, 'blue', true);
    const redUnit = addTeamUnit(world, 'red', true);
    const enemy = addCombatant(world, 'red', 500, 500, 9);

    attackSelectedTarget(queries, enemy);

    expect(blueUnit.target).toEqual({ entityId: 9, manual: true });
    expect(redUnit.target).toBeUndefined();
  });
});

describe('createInputSystem right-click handling', () => {
  const viewport = { x: 0, y: 0, scale: 1 };

  function makeCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect;
    document.body.appendChild(canvas);
    return canvas;
  }

  function setup() {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const canvas = makeCanvas();
    const input = new InputSystem(canvas);
    const system = createInputSystem(input, queries, () => viewport, DEFAULT_CELL_SIZE);
    const rightClick = (x: number, y: number) => {
      canvas.dispatchEvent(
        new MouseEvent('contextmenu', { clientX: x, clientY: y, cancelable: true })
      );
      system(world, 1 / 60);
    };

    return { world, queries, input, rightClick };
  }

  it('orders an attack when the right-click lands on an enemy unit', () => {
    const { world, queries, input, rightClick } = setup();
    const unit = addTeamUnit(world, 'blue', true);
    addCombatant(world, 'red', 200, 200, 9);
    expect([...queries.selected]).toEqual([unit]);

    rightClick(200, 200);

    expect(unit.target).toEqual({ entityId: 9, manual: true });
    expect(unit.moveTarget).toBeUndefined();
    input.dispose();
  });

  it('issues an ordinary move order when it lands on empty ground', () => {
    const { world, input, rightClick } = setup();
    const unit = addTeamUnit(world, 'blue', true);
    addCombatant(world, 'red', 200, 200, 9);

    rightClick(600, 500);

    expect(unit.target).toBeUndefined();
    expect(unit.moveTarget).toEqual({ position: { x: 592, y: 496 } });
    input.dispose();
  });

  it('issues a move order when it lands on one of the player\'s own units', () => {
    const { world, input, rightClick } = setup();
    const unit = addTeamUnit(world, 'blue', true);
    addCombatant(world, 'blue', 200, 200, 9);

    rightClick(200, 200);

    expect(unit.target).toBeUndefined();
    expect(unit.moveTarget).toEqual({ position: { x: 208, y: 208 } });
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
