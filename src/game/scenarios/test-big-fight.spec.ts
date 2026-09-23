import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import type { ParsedMap } from '~/game/map/load-tiled-map';
import { testBigFightScenario } from './test-big-fight';

/** A small map with a wall down its middle column, to verify units never land on it. */
function mapWithWallColumn(width: number, height: number, wallCol: number): ParsedMap {
  const collision = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    collision[row * width + wallCol] = 1;
  }

  return {
    width,
    height,
    tileSize: 32,
    collision,
    spawns: [],
    // Never drawn here; the scenario only reads the collision grid.
    tileset: {
      firstgid: 1,
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 0,
      columns: 1,
      imageUrl: '',
      blockedTileIds: new Set(),
    },
    tileLayers: [],
  };
}

describe('testBigFightScenario', () => {
  it('spawns an equal, large number of units on each team', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);

    testBigFightScenario.setup(world);

    const blue = [...world].filter((e) => e.team === 'blue');
    const red = [...world].filter((e) => e.team === 'red');

    expect(blue.length).toBe(red.length);
    // Large enough to actually stress-test the engine, per the ticket.
    expect(blue.length).toBeGreaterThanOrEqual(100);
    expect(world.size).toBe(blue.length + red.length);
    expect(queries.renderable.size).toBe(world.size);
  });

  it('spawns a mix of combat-capable unit types with no overlapping positions', () => {
    const world = new World<Entity>();

    testBigFightScenario.setup(world);

    const unitTypesSeen = new Set<string>();
    const positions = new Set<string>();
    for (const entity of world) {
      expect(['swordsmen', 'knight', 'crossbowsoldier']).toContain(entity.unitType);
      expect(entity.attackRange).toBeDefined();
      expect(entity.damage).toBeDefined();
      expect(entity.attackCooldown).toBeDefined();

      unitTypesSeen.add(entity.unitType as string);

      const key = `${entity.transform?.position.x},${entity.transform?.position.y}`;
      expect(positions.has(key)).toBe(false);
      positions.add(key);
    }

    // Confirms this is actually a mixed roster, not accidentally all one type.
    expect(unitTypesSeen).toEqual(new Set(['swordsmen', 'knight', 'crossbowsoldier']));
  });

  it('spawns each team with the same unit-type composition', () => {
    const world = new World<Entity>();

    testBigFightScenario.setup(world);

    const countByTeamAndType = new Map<string, number>();
    for (const entity of world) {
      const key = `${entity.team}:${entity.unitType}`;
      countByTeamAndType.set(key, (countByTeamAndType.get(key) ?? 0) + 1);
    }

    for (const unitType of ['swordsmen', 'knight', 'crossbowsoldier']) {
      const blueCount = countByTeamAndType.get(`blue:${unitType}`);
      const redCount = countByTeamAndType.get(`red:${unitType}`);
      expect(blueCount).toBeGreaterThan(0);
      expect(blueCount).toBe(redCount);
    }
  });

  it('throws when the map has fewer walkable cells than units to place', () => {
    const world = new World<Entity>();
    // Only 4 walkable cells (2x2), nowhere near enough for both teams.
    const map = mapWithWallColumn(2, 2, -1);

    expect(() => testBigFightScenario.setup(world, map)).toThrow(/walkable cells/);
  });

  it('never places a unit on a blocked (wall) cell', () => {
    const world = new World<Entity>();
    // Wide enough (600 walkable cols x 2 rows minus the wall column) to fit
    // all of this scenario's units while still leaving a wall for every unit
    // to avoid.
    const map = mapWithWallColumn(300, 2, 150);

    testBigFightScenario.setup(world, map);

    for (const entity of world) {
      const col = entity.transform!.position.x / map.tileSize;
      expect(Math.floor(col)).not.toBe(150);
    }
  });
});
