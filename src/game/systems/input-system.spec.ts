import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/types';
import { createQueries } from '~/game/ecs/world';
import { Vector2 } from '~/lib/math/Vector2';
import { selectAt } from './input-system';

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
