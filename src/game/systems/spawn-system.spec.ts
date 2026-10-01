import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import type { SpawnPoint } from '~/game/map/load-tiled-map';
import { anchorCellAt, footprintOf } from '~/game/navigation/footprint';
import { claimSpawn } from './spawn-system';
import { DEFAULT_CELL_SIZE } from '~/lib/grid';

const spawns: SpawnPoint[] = [
  { id: 'spawn-1', position: { x: 10, y: 20 } },
  { id: 'spawn-2', position: { x: 30, y: 40 } },
];

describe('claimSpawn', () => {
  it('spawns one unit at the named spawn point when claimed for a single unit', () => {
    const world = new World<Entity>();

    const [unit] = claimSpawn(world, spawns, 'spawn-1', {
      team: 'blue',
      units: ['swordsmen'],
    }, DEFAULT_CELL_SIZE);

    expect(world.size).toBe(1);
    // (10, 20) is centred in the 16px cell spanning [0, 16) x [16, 32): (8, 24).
    expect(unit.transform?.position).toEqual({ x: 8, y: 24 });
    expect(unit.team).toBe('blue');
    expect(unit.unitType).toBe('swordsmen');
    expect(unit.renderable?.shape).toBe('square');
  });

  it('spawns multiple, possibly mixed-type units at one spawn point, spread apart', () => {
    const world = new World<Entity>();

    const claimed = claimSpawn(world, spawns, 'spawn-1', {
      team: 'red',
      units: ['swordsmen', 'knight', 'crossbowsoldier'],
    }, DEFAULT_CELL_SIZE);

    expect(world.size).toBe(3);
    expect(claimed.map((e) => e.unitType)).toEqual([
      'swordsmen',
      'knight',
      'crossbowsoldier',
    ]);
    expect(claimed.every((e) => e.team === 'red')).toBe(true);

    // Spread apart along x with no duplicate positions, and — footprints
    // included — no two units sharing a cell: the knight's 2x2 block is
    // given two cells' worth of the row rather than packed as tightly as
    // its 1x1 neighbours (see `layoutOffsets`).
    const xs = claimed.map((e) => e.transform?.position.x);
    expect(new Set(xs).size).toBe(3);

    const cells = claimed.flatMap((entity) => {
      const size = footprintOf(entity);
      const { x, y } = entity.transform!.position;
      const anchor = anchorCellAt(x, y, size, DEFAULT_CELL_SIZE);
      const held: string[] = [];
      for (let dy = 0; dy < size.height; dy++) {
        for (let dx = 0; dx < size.width; dx++) {
          held.push(`${anchor.x + dx},${anchor.y + dy}`);
        }
      }
      return held;
    });
    expect(new Set(cells).size).toBe(cells.length);
    // 1 (swordsmen) + 4 (knight's 2x2 block) + 1 (crossbowsoldier).
    expect(cells).toHaveLength(6);
  });

  it('lets different spawns be claimed for different teams', () => {
    const world = new World<Entity>();

    claimSpawn(world, spawns, 'spawn-1', { team: 'blue', units: ['swordsmen'] }, DEFAULT_CELL_SIZE);
    claimSpawn(
      world,
      spawns,
      'spawn-2',
      { team: 'red', units: ['crossbowsoldier'] },
      DEFAULT_CELL_SIZE
    );

    expect(world.size).toBe(2);
    const entities = [...world];
    expect(entities.some((e) => e.team === 'blue' && e.unitType === 'swordsmen')).toBe(
      true
    );
    expect(
      entities.some((e) => e.team === 'red' && e.unitType === 'crossbowsoldier')
    ).toBe(true);
  });

  it('throws for an unknown spawn id', () => {
    const world = new World<Entity>();

    expect(() =>
      claimSpawn(world, spawns, 'does-not-exist', { team: 'blue', units: ['knight'] }, DEFAULT_CELL_SIZE)
    ).toThrow(/does-not-exist/);
  });

  it('spaces units one cell apart at the cell size it is given', () => {
    const world = new World<Entity>();

    const claimed = claimSpawn(
      world,
      [{ id: 'spawn', position: { x: 100, y: 20 } }],
      'spawn',
      { team: 'blue', units: ['swordsmen', 'swordsmen', 'swordsmen'] },
      40
    );

    // Offsets of -40/0/+40 around x = 100 land in three adjacent 40px cells.
    expect(claimed.map((unit) => unit.transform?.position)).toEqual([
      { x: 60, y: 20 },
      { x: 100, y: 20 },
      { x: 140, y: 20 },
    ]);
  });
});
