import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import type { ParsedMap } from '~/game/map/loadTiledMap';
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
    terrain: [],
    collision,
    spawns: [],
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

  it('spawns every unit as a combat-capable swordsman with no overlapping positions', () => {
    const world = new World<Entity>();

    testBigFightScenario.setup(world);

    const positions = new Set<string>();
    for (const entity of world) {
      expect(entity.unitType).toBe('swordsmen');
      expect(entity.attackRange).toBeDefined();
      expect(entity.damage).toBeDefined();
      expect(entity.attackCooldown).toBeDefined();

      const key = `${entity.transform?.position.x},${entity.transform?.position.y}`;
      expect(positions.has(key)).toBe(false);
      positions.add(key);
    }
  });

  it('never places a unit on a blocked (wall) cell', () => {
    const world = new World<Entity>();
    // Wide enough (600 walkable cols x 2 rows minus the wall column) to fit
    // 500 units while still leaving a wall for every unit to avoid.
    const map = mapWithWallColumn(300, 2, 150);

    testBigFightScenario.setup(world, map);

    for (const entity of world) {
      const col = entity.transform!.position.x / map.tileSize;
      expect(Math.floor(col)).not.toBe(150);
    }
  });
});
