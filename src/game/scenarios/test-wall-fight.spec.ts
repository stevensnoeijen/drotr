import fs from 'node:fs';
import path from 'node:path';

import { World } from 'miniplex';
import type { TiledMap } from 'tiled-types';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import {
  parseTiledMap,
  parseTiledTileset,
  type ParsedMap,
  type TerrainType,
} from '~/game/map/loadTiledMap';
import { CELL_SIZE } from '~/lib/grid';
import { findPath, hasLineOfSight } from '~/lib/navigation/astar';
import { ESCORT_GROUP, testWallFightScenario, WALL_PAIR } from './test-wall-fight';

/**
 * The committed `test` map, loaded the same way `loadTiledMap.spec.ts` does:
 * this scenario's positions are hard-coded against that map's maze walls, so
 * the assertions below are only worth anything against the real thing.
 */
const MAP_DIR = path.resolve(import.meta.dirname, '../../../public/maps');
const testMap: ParsedMap = parseTiledMap(
  JSON.parse(fs.readFileSync(path.join(MAP_DIR, 'test.tmj'), 'utf-8')) as TiledMap,
  new Map<number, TerrainType>(
    [...parseTiledTileset(fs.readFileSync(path.join(MAP_DIR, 'test.tsx'), 'utf-8'))].map(
      ([localId, type]) => [localId + 1, type]
    )
  )
);

const cell = ({ col, row }: { col: number; row: number }) => ({ x: col, y: row });

const distanceCells = (
  a: { col: number; row: number },
  b: { col: number; row: number }
) => Math.hypot(a.col - b.col, a.row - b.row);

function setup() {
  const world = new World<Entity>();
  testWallFightScenario.setup(world, testMap);

  /** The unit standing in a given cell — iteration order is not relied on. */
  const at = ({ col, row }: { col: number; row: number }): Entity | undefined =>
    [...world].find(
      (entity) =>
        Math.floor(entity.transform!.position.x / CELL_SIZE) === col &&
        Math.floor(entity.transform!.position.y / CELL_SIZE) === row
    );

  return { world, at };
}

describe('testWallFightScenario', () => {
  it('spawns a combat-capable swordsman in each of its declared cells', () => {
    const { world, at } = setup();

    const declared = [
      { team: 'blue', at: WALL_PAIR.blue },
      { team: 'red', at: WALL_PAIR.red },
      { team: 'blue', at: ESCORT_GROUP.blue },
      { team: 'red', at: ESCORT_GROUP.nearRed },
      { team: 'red', at: ESCORT_GROUP.farRed },
    ];

    expect(world.size).toBe(declared.length);
    for (const { team, at: position } of declared) {
      const unit = at(position);
      expect(unit?.team).toBe(team);
      expect(unit?.unitType).toBe('swordsmen');
      expect(unit?.attackRange).toBeDefined();
      expect(unit?.aggroRange).toBeDefined();
      expect(unit?.moveSpeed).toBeDefined();
    }
  });

  it('places no unit on a blocked cell', () => {
    const { world } = setup();

    for (const entity of world) {
      const col = Math.floor(entity.transform!.position.x / CELL_SIZE);
      const row = Math.floor(entity.transform!.position.y / CELL_SIZE);
      expect(testMap.collision[row * testMap.width + col]).toBe(0);
    }
  });

  it('puts the wall pair in aggro range of each other but with no line of sight', () => {
    const { at } = setup();
    const blue = at(WALL_PAIR.blue)!;

    // Close enough for perception to acquire it...
    expect(distanceCells(WALL_PAIR.blue, WALL_PAIR.red)).toBeLessThanOrEqual(
      blue.aggroRange!.value
    );
    // ...but with a wall in between, which is the whole point.
    expect(hasLineOfSight(testMap, cell(WALL_PAIR.blue), cell(WALL_PAIR.red))).toBe(false);
  });

  it('leaves the wall pair a long way round, which is what the routing has to find', () => {
    const route = findPath(testMap, cell(WALL_PAIR.blue), cell(WALL_PAIR.red), {
      smooth: false,
    });

    expect(route.status).toBe('found');
    // Far longer than the 4-cell straight line between them, so a unit that
    // simply walked at its target would visibly be stuck on the wall.
    expect(route.cells.length).toBeGreaterThan(20);
  });

  it('puts only the escort group\'s near red inside its aggro range', () => {
    const { at } = setup();
    const escort = at(ESCORT_GROUP.blue)!;
    const aggro = escort.aggroRange!.value;

    expect(distanceCells(ESCORT_GROUP.blue, ESCORT_GROUP.nearRed)).toBeLessThanOrEqual(aggro);
    // Only reachable by a manual attack order, which is what makes the
    // order's stickiness visible: perception would never pick this one.
    expect(distanceCells(ESCORT_GROUP.blue, ESCORT_GROUP.farRed)).toBeGreaterThan(aggro);
  });

  it('has a clear line to both escort reds, so that group tests targeting and not routing', () => {
    expect(hasLineOfSight(testMap, cell(ESCORT_GROUP.blue), cell(ESCORT_GROUP.nearRed))).toBe(
      true
    );
    expect(hasLineOfSight(testMap, cell(ESCORT_GROUP.blue), cell(ESCORT_GROUP.farRed))).toBe(
      true
    );
  });
});
