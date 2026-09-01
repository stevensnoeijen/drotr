import { cellPosition, spawnUnit } from '~/game/data/spawn';
import type { ParsedMap } from '~/game/map/loadTiledMap';
import type { Scenario } from './types';

/**
 * World-space position of the center of a map *tile* (as opposed to
 * {@link cellPosition}'s coarser 64px unit-placement grid — the `test` map's
 * tiles are 32px, so a raw `cellPosition` col/row doesn't correspond to a
 * tile at all and can land units well outside the map).
 */
function tilePosition(map: ParsedMap | undefined, col: number, row: number) {
  const tileSize = map?.tileSize ?? 32;
  return { x: col * tileSize + tileSize / 2, y: row * tileSize + tileSize / 2 };
}

/**
 * Two blue-vs-red swordsmen pairs, exercising unit rendering, placement and
 * (once combat lands) attack-range behaviour independent of any map: one
 * pair placed next to each other so they're immediately within attack
 * range, the other placed four tiles apart so they're not. Prefixed
 * `test`: it exists to test the engine, not to demonstrate a real gameplay
 * setup.
 */
export const testScenario: Scenario = {
  id: 'test',
  title: 'Test',
  description:
    'Two swordsmen pairs: one within attack range fighting, one four tiles apart not fighting.',
  setup: (world, map) => {
    const adjacentRow = 2;
    const separatedRow = 9;

    // Within attack range: one cell apart.
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: cellPosition(2, adjacentRow),
    });
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'red',
      position: cellPosition(3, adjacentRow),
    });

    // Out of attack range: four cells apart.
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: cellPosition(2, separatedRow),
    });
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'red',
      position: cellPosition(6, separatedRow),
    });

    // Isolated, far from every red unit: for exercising click-to-move
    // (and, once #88 lands, pathfinding around the maze block) without
    // combat kicking in.
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: tilePosition(map, 55, 55),
    });

    // Just below (south of) the maze block, lined up with its bottom exit
    // (tile cols 44-46), for exercising click-to-move into and through the
    // maze corridors.
    spawnUnit(world, {
      type: 'swordsmen',
      team: 'blue',
      position: tilePosition(map, 45, 50),
    });
  },
};
