import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { fireProjectile } from '~/game/combat/fire-projectile';
import type { Entity } from '~/game/ecs/entity';
import { createQueries } from '~/game/ecs/world';
import { createMapNavigation } from '~/game/navigation/map-navigation';
import { cellDistance } from '~/game/systems/combat-system';
import { runPerceptionScan } from '~/game/systems/perception-system';
import { spawnUnit } from './spawn';
import type { UnitType } from './units';

/**
 * Pins unit movement speed, attack reach and aggro reach in *world units* on
 * a county-sized (40px tile) map. Unit data is authored in map tiles; however
 * the unit-placement grid is subdivided, a unit must cover the same pixels
 * per second and shoot / notice enemies from the same pixel distance.
 */
const TILE = 40;

/** An open (collision-free) 40px-tile map, big enough for every case below. */
function openMap() {
  const width = 32;
  const height = 8;
  return { width, height, tileSize: TILE, collision: new Uint8Array(width * height) };
}

function setup() {
  const world = new World<Entity>();
  const queries = createQueries(world);
  const { cellSize } = createMapNavigation(openMap());
  const spawn = (type: UnitType, team: Entity['team'], x: number, y = TILE) =>
    spawnUnit(world, { type, team: team!, position: { x, y } }, cellSize);
  return { world, queries, cellSize, spawn };
}

describe('unit world scale on a 40px-tile map', () => {
  it.each([
    ['swordsmen', 2 * TILE],
    ['crossbowsoldier', 2 * TILE],
    ['knight', 3 * TILE],
  ] as const)('moves a %s at its authored tiles/sec in world units', (type, pxPerSecond) => {
    const { spawn } = setup();
    expect(spawn(type, 'blue', TILE).moveSpeed?.value).toBe(pxPerSecond);
  });

  it('fires a crossbow bolt at 10 tiles/sec in world units', () => {
    const { spawn } = setup();
    expect(spawn('crossbowsoldier', 'blue', TILE).ranged?.projectileSpeed).toBe(10 * TILE);
  });

  it('lets a crossbow soldier reach a target 5 tiles away, but not 6', () => {
    const { spawn, cellSize } = setup();
    const shooter = spawn('crossbowsoldier', 'blue', TILE);
    const from = shooter.transform!.position;
    const inRange = { x: from.x + 5 * TILE, y: from.y };
    const outOfRange = { x: from.x + 6 * TILE, y: from.y };

    expect(cellDistance(from, inRange, cellSize)).toBeLessThanOrEqual(shooter.attackRange!.value);
    expect(cellDistance(from, outOfRange, cellSize)).toBeGreaterThan(shooter.attackRange!.value);
  });

  it("caps a crossbow bolt's flight at a multiple of its 5 tile range in world units", () => {
    const { world, spawn, cellSize } = setup();
    const shooter = spawn('crossbowsoldier', 'blue', TILE);
    const target = spawn('swordsmen', 'red', TILE * 4);

    fireProjectile(
      world,
      shooter as Parameters<typeof fireProjectile>[1],
      target as Parameters<typeof fireProjectile>[2],
      target.id!,
      cellSize
    );

    const bolt = [...world.with('projectile')][0];
    expect(bolt.projectile.maxRange).toBe(15 * TILE);
  });

  it('keeps melee range at one adjacent movement cell', () => {
    const { spawn, cellSize } = setup();
    for (const type of ['swordsmen', 'knight'] as const) {
      const unit = spawn(type, 'blue', TILE);
      const from = unit.transform!.position;
      expect(cellDistance(from, { x: from.x + cellSize, y: from.y + cellSize }, cellSize))
        .toBeLessThanOrEqual(unit.attackRange!.value);
      expect(cellDistance(from, { x: from.x + 2 * cellSize, y: from.y }, cellSize))
        .toBeGreaterThan(unit.attackRange!.value);
    }
  });

  it.each([
    ['swordsmen', 5],
    ['crossbowsoldier', 5],
    ['knight', 8],
  ] as const)('makes a %s aggro on an enemy %i tiles away, but not a tile further', (type, tiles) => {
    const { world, queries, cellSize, spawn } = setup();
    const self = spawn(type, 'blue', TILE);
    const x = self.transform!.position.x;

    const enemy = spawn('swordsmen', 'red', x + tiles * TILE);
    // Pins the enemy exactly `tiles` away on the same row as `self`: a
    // knight rests on its 2x2 block's centre (a cell corner), a swordsman
    // on a plain cell centre, so letting each spawn snap independently can
    // leave a half-cell y (and x) drift between them that this exact-range
    // boundary check isn't meant to exercise.
    enemy.transform!.position.x = x + tiles * TILE;
    enemy.transform!.position.y = self.transform!.position.y;
    runPerceptionScan(world, queries, cellSize);
    expect(self.target?.entityId).toBe(enemy.id);

    enemy.transform!.position.x = x + (tiles + 1) * TILE;
    runPerceptionScan(world, queries, cellSize);
    expect(self.target).toBeUndefined();
  });
});
