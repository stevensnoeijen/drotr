import * as fs from 'node:fs';
import * as path from 'node:path';

import { World } from 'miniplex';
import type { TiledMap } from 'tiled-types';
import { describe, expect, it } from 'vitest';

import { spawnUnit } from '~/game/data/spawn';
import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import {
  parseTiledMap,
  parseTilesetDescription,
  type ParsedMap,
} from '~/game/map/load-tiled-map';
import { createMapNavigation } from '~/game/navigation/map-navigation';
import { toGridPosition } from '~/lib/grid';
import { Vector2 } from '~/lib/math/vector2';
import { findPath, hasLineOfSight } from '~/lib/navigation/astar';
import { pickDistinct } from '~/lib/random';
import { createCellOccupancySystem } from './cell-occupancy-system';
import { moveSelectedTo } from './input-system';
import { createMovePathSystem } from './move-path-system';
import { createMoveTargetSystem } from './move-target-system';
import { createMoveVelocitySystem } from './move-velocity-system';
import { createPendingMoveOrderSystem } from './pending-move-order-system';

const MAPS_DIR = path.join(process.cwd(), 'public', 'maps');

/** The committed, converted FAGARAS county map: 128x128 tiles of 40px. */
function loadFagaras(): ParsedMap {
  const map = JSON.parse(
    fs.readFileSync(path.join(MAPS_DIR, 'fagaras.tmj'), 'utf-8')
  ) as TiledMap;
  const tileset = parseTilesetDescription(
    fs.readFileSync(path.join(MAPS_DIR, 'terrain.tsx'), 'utf-8'),
    map.tilesets[0].firstgid,
    'http://host/maps/terrain.tsx'
  );
  return parseTiledMap(map, tileset);
}

/**
 * End-to-end coverage for a real county map, whose 40px tiles differ from
 * the default 32px tile size: a move order is routed by A* over the map's
 * collision upsampled onto 20px half-tile cells and walked through the same
 * systems, in the same order, `game-canvas.tsx` wires — never entering a
 * cell of a tile the tileset marks `blocked`.
 */
describe('navigation on a converted county map (fagaras, 40px tiles)', () => {
  const map = loadFagaras();

  it('moves units on 20px half-tile cells, with pathfinding and occupancy enabled', () => {
    const { cellSize, navigationGrid, occupancyGrid } =
      createMapNavigation(map);

    expect(map.tileSize).toBe(40);
    expect(cellSize).toBe(20);
    expect(navigationGrid).toMatchObject({ width: map.width * 2, height: map.height * 2 });
    expect(occupancyGrid?.cellSize).toBe(20);
  });

  it('resolves every spawn point to an open cell on the half-tile grid', () => {
    const { cellSize, occupancyGrid } = createMapNavigation(map);
    for (const { position } of map.spawns) {
      const cell = toGridPosition(new Vector2(position.x, position.y), cellSize);
      expect(occupancyGrid!.isTerrainBlocked(occupancyGrid!.indexOf(cell.x, cell.y))).toBe(false);
    }
  });

  it('routes a unit around blocked terrain from one spawn to the other and walks it there', () => {
    const { cellSize, navigationGrid, occupancyGrid } =
      createMapNavigation(map);
    const dt = 1 / 60;
    const world = new World<Entity>();
    const queries = createQueries(world);

    // A 1x1 unit (swordsmen), not the knight: this test is about the
    // general real-map routing/occupancy infrastructure, not multi-cell
    // footprints — a dedicated footprint test covers the knight's 2x2 block
    // on terrain built to exercise it, rather than wherever a cross-map A*
    // route on this particular map happens to pinch narrower than two cells
    // wide (out of scope here; see "Wide units and A*" in MOVEMENT.md).
    //
    // Scripted draws put red on edge-2 and blue on edge-3 (see
    // `pickDistinct`): a pair in the same connected region of the map.
    const draws = [0.5, 0.9];
    const [redSpawn, blueSpawn] = pickDistinct(map.spawns, 2, () => draws.shift()!);
    const blue = spawnUnit(
      world,
      { type: 'swordsmen', team: 'blue', position: blueSpawn.position },
      cellSize
    );
    const red = spawnUnit(
      world,
      { type: 'swordsmen', team: 'red', position: redSpawn.position },
      cellSize
    );
    // Only the blue unit's walk matters here: the red one would just be an
    // obstacle sitting on the destination.
    const destination = { ...red.transform!.position };
    world.remove(red);
    world.addComponent(blue, 'selected', true);

    const cellOf = (position: { x: number; y: number }) =>
      toGridPosition(new Vector2(position.x, position.y), cellSize);

    // The straight line between the spawns crosses blocked terrain, so
    // arriving at all means the order was routed around it.
    expect(
      hasLineOfSight(navigationGrid!, cellOf(blue.transform!.position), cellOf(destination))
    ).toBe(false);

    const systems = [
      createPendingMoveOrderSystem(queries, cellSize, navigationGrid),
      createMovePathSystem(queries),
      createMoveTargetSystem(queries),
      createCellOccupancySystem(queries, occupancyGrid!),
      createMoveVelocitySystem(queries),
    ];
    const tick = () => systems.forEach((system) => system(world, dt));

    tick();
    moveSelectedTo(
      queries,
      new Vector2(destination.x, destination.y),
      cellSize,
      navigationGrid,
      occupancyGrid
    );
    expect(blue.movePath?.waypoints.length).toBeGreaterThan(0);

    for (let i = 0; i < 60 * 60 && (blue.movePath || blue.moveTarget); i++) {
      tick();
      const index = occupancyGrid!.indexAt(blue.transform!.position);
      expect(occupancyGrid!.isTerrainBlocked(index)).toBe(false);
    }

    expect(blue.movePath).toBeUndefined();
    expect(blue.moveTarget).toBeUndefined();
    // Resting on the centre of the destination's 20px cell.
    const destinationCell = cellOf(destination);
    expect(blue.transform!.position).toEqual({
      x: destinationCell.x * cellSize + cellSize / 2,
      y: destinationCell.y * cellSize + cellSize / 2,
    });
  });

  /** The tile a spawn point sits on. */
  const spawnCell = (id: string) => {
    const { position } = map.spawns.find((spawn) => spawn.id === id)!;
    return toGridPosition(new Vector2(position.x, position.y), map.tileSize);
  };

  it('has exactly the 3 generated edge spawns, each on an open cell', () => {
    expect(map.spawns.map((spawn) => spawn.id)).toEqual([
      'edge-1',
      'edge-2',
      'edge-3',
    ]);
    for (const { id } of map.spawns) {
      const cell = spawnCell(id);
      expect(map.collision[cell.y * map.width + cell.x]).toBe(0);
    }
  });

  // edge-1, on the west border, sits in a region the collision layer walls
  // off from the rest of the map, so only the other pair is routable.
  it('routes between edge-2 and edge-3 in both directions', () => {
    for (const [from, to] of [
      ['edge-2', 'edge-3'],
      ['edge-3', 'edge-2'],
    ]) {
      const result = findPath(map, spawnCell(from), spawnCell(to), {
        smooth: false,
      });
      expect(result.status).toBe('found');
    }
  });

  it('finds a cross-map route without searching most of the 128x128 grid', () => {
    // A deterministic stand-in for a wall-clock perf budget: the A* open list
    // is a plain array, so cost grows with the nodes a search expands. The
    // spawn-to-spawn route should stay a directed search, not a flood fill.
    const from = spawnCell('edge-2');
    const to = spawnCell('edge-3');

    const result = findPath(map, from, to, { smooth: false });

    expect(result.status).toBe('found');
    expect(result.expanded).toBeLessThan((map.width * map.height) / 10);
  });
});
