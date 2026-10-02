import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import { anchorCellAt, entityGap } from '~/game/navigation/footprint';
import { cellSizeOf } from '~/lib/grid';
import { testScenario } from './test';

/** The test map's 32px tiles, halved into movement cells. */
const cellSize = cellSizeOf({ tileSize: 32 });

function setup() {
  const world = new World<Entity>();
  testScenario.setup(world, undefined);
  return world;
}

/**
 * Each red unit paired with its blue opponent — the blue unit on the same row
 * of the same type, or failing that the nearest blue unit — and the cell
 * distance between them.
 */
function duels(world: World<Entity>) {
  const units = [...world];
  const blues = units.filter((e) => e.team === 'blue');
  const distance = (a: Entity, b: Entity) => entityGap(a, b, cellSize);
  return units
    .filter((e) => e.team === 'red')
    .map((red) => {
      const sameRow = blues.find(
        (b) => b.unitType === red.unitType && b.transform!.position.y === red.transform!.position.y
      );
      const blue =
        sameRow ?? [...blues].sort((a, b) => distance(a, red) - distance(b, red))[0];
      return { red, blue, distance: distance(blue, red) };
    });
}

describe('testScenario', () => {
  it('seeds both teams and every unit is renderable', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    testScenario.setup(world);

    expect(world.size).toBeGreaterThan(0);
    expect(queries.renderable.size).toBe(world.size);
    expect([...world].some((e) => e.team === 'blue')).toBe(true);
    expect([...world].some((e) => e.team === 'red')).toBe(true);
  });

  it('starts the adjacent swordsmen pair within melee range', () => {
    const swordsmenDuels = duels(setup()).filter(
      ({ red, blue }) => red.unitType === 'swordsmen' && blue.unitType === 'swordsmen'
    );
    const inRange = swordsmenDuels.filter(({ blue, distance }) => distance <= blue.attackRange!.value);

    expect(inRange).toHaveLength(1);
  });

  it('places the knight duel so the swordsman touches the knight\'s 2x2 block only at a corner', () => {
    const { red, blue } = duels(setup()).find(({ blue }) => blue.unitType === 'knight')!;
    const knight = blue.transform!.position;
    const foe = red.transform!.position;
    const knightAnchor = anchorCellAt(knight.x, knight.y, blue.footprint!, cellSize);
    const foeCell = anchorCellAt(foe.x, foe.y, { width: 1, height: 1 }, cellSize);

    expect(entityGap(blue, red, cellSize)).toBe(1);
    // Outside the block's columns and rows alike: a corner, not an edge.
    expect([knightAnchor.x, knightAnchor.x + 1]).not.toContain(foeCell.x);
    expect([knightAnchor.y, knightAnchor.y + 1]).not.toContain(foeCell.y);
  });

  it('starts the separated swordsmen pair outside melee range but inside aggro range', () => {
    const separated = duels(setup()).filter(
      ({ red, blue, distance }) =>
        red.unitType === 'swordsmen' &&
        blue.unitType === 'swordsmen' &&
        distance > blue.attackRange!.value
    );

    expect(separated).toHaveLength(1);
    const { red, blue } = separated[0];
    const dx = red.transform!.position.x - blue.transform!.position.x;
    expect(Math.abs(dx)).toBeLessThanOrEqual(blue.aggroRange!.value * cellSize);
  });

  it('starts both crossbow pairs within attack range of each other', () => {
    const crossbows = duels(setup()).filter(({ red }) => red.unitType === 'crossbowsoldier');

    expect(crossbows).toHaveLength(2);
    for (const { blue, distance } of crossbows) {
      expect(blue.unitType).toBe('crossbowsoldier');
      expect(distance).toBeLessThanOrEqual(blue.attackRange!.value);
    }
  });
});
