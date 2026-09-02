import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/types';
import type { SpawnPoint } from '~/game/map/loadTiledMap';
import { claimSpawn } from './spawn-system';

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
    });

    expect(world.size).toBe(1);
    // (10, 20) is centered in the [0, 32) cell on both axes: (16, 16).
    expect(unit.transform?.position).toEqual({ x: 16, y: 16 });
    expect(unit.team).toBe('blue');
    expect(unit.unitType).toBe('swordsmen');
    expect(unit.renderable?.shape).toBe('square');
  });

  it('spawns multiple, possibly mixed-type units at one spawn point, spread apart', () => {
    const world = new World<Entity>();

    const claimed = claimSpawn(world, spawns, 'spawn-1', {
      team: 'red',
      units: ['swordsmen', 'knight', 'crossbowsoldier'],
    });

    expect(world.size).toBe(3);
    expect(claimed.map((e) => e.unitType)).toEqual([
      'swordsmen',
      'knight',
      'crossbowsoldier',
    ]);
    expect(claimed.every((e) => e.team === 'red')).toBe(true);

    // Every unit sits in the spawn's y-cell, spread apart along x with no
    // duplicate positions — they don't stack on top of each other.
    const xs = claimed.map((e) => e.transform?.position.x);
    expect(new Set(xs).size).toBe(3);
    expect(claimed.every((e) => e.transform?.position.y === 16)).toBe(true);
  });

  it('lets different spawns be claimed for different teams', () => {
    const world = new World<Entity>();

    claimSpawn(world, spawns, 'spawn-1', { team: 'blue', units: ['swordsmen'] });
    claimSpawn(world, spawns, 'spawn-2', { team: 'red', units: ['crossbowsoldier'] });

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
      claimSpawn(world, spawns, 'does-not-exist', { team: 'blue', units: ['knight'] })
    ).toThrow(/does-not-exist/);
  });
});
