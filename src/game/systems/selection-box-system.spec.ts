import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity, Team } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { selectInBox } from './selection-box-system';

function addUnit(world: World<Entity>, x: number, y: number, team: Team = 'blue', size = 20) {
  return world.add({
    transform: { position: { x, y }, rotation: 0 },
    renderable: { shape: 'circle', color: 0x66ccff, size },
    selectable: true,
    team,
  });
}

describe('selectInBox', () => {
  it('selects every blue unit fully inside the box', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const a = addUnit(world, 100, 100);
    const b = addUnit(world, 150, 150);
    const outside = addUnit(world, 500, 500);

    selectInBox(world, queries, { x: 0, y: 0 }, { x: 200, y: 200 });

    expect(a.selected).toBe(true);
    expect(b.selected).toBe(true);
    expect(outside.selected).toBeUndefined();
    expect(new Set(queries.selected)).toEqual(new Set([a, b]));
  });

  it('selects a unit that only partially overlaps the box', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    // Unit center is outside the box, but its 20-radius bounding box overlaps it.
    const unit = addUnit(world, 210, 100, 'blue', 20);

    selectInBox(world, queries, { x: 0, y: 0 }, { x: 200, y: 200 });

    expect(unit.selected).toBe(true);
  });

  it('does not select a unit whose bounding box misses the box entirely', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const unit = addUnit(world, 300, 100, 'blue', 20);

    selectInBox(world, queries, { x: 0, y: 0 }, { x: 200, y: 200 });

    expect(unit.selected).toBeUndefined();
  });

  it('never selects red-team units, even fully inside the box', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const red = addUnit(world, 100, 100, 'red');

    selectInBox(world, queries, { x: 0, y: 0 }, { x: 200, y: 200 });

    expect(red.selected).toBeUndefined();
    expect([...queries.selected]).toHaveLength(0);
  });

  it('replaces the existing selection on a plain drag', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const previous = addUnit(world, 900, 900);
    world.addComponent(previous, 'selected', true);
    const inBox = addUnit(world, 100, 100);

    selectInBox(world, queries, { x: 0, y: 0 }, { x: 200, y: 200 });

    expect(previous.selected).toBeUndefined();
    expect(inBox.selected).toBe(true);
  });

  it('clears the selection when the box contains no blue units', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const previous = addUnit(world, 100, 100);
    world.addComponent(previous, 'selected', true);

    selectInBox(world, queries, { x: 5000, y: 5000 }, { x: 5200, y: 5200 });

    expect(previous.selected).toBeUndefined();
    expect([...queries.selected]).toHaveLength(0);
  });

  it('unions with the existing selection on a shift-drag', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const previous = addUnit(world, 900, 900);
    world.addComponent(previous, 'selected', true);
    const inBox = addUnit(world, 100, 100);

    selectInBox(world, queries, { x: 0, y: 0 }, { x: 200, y: 200 }, true);

    expect(previous.selected).toBe(true);
    expect(inBox.selected).toBe(true);
    expect(new Set(queries.selected)).toEqual(new Set([previous, inBox]));
  });

  it('leaves the existing selection untouched on a shift-drag that hits nothing', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const previous = addUnit(world, 900, 900);
    world.addComponent(previous, 'selected', true);

    selectInBox(world, queries, { x: 0, y: 0 }, { x: 200, y: 200 }, true);

    expect(previous.selected).toBe(true);
    expect([...queries.selected]).toEqual([previous]);
  });
});
