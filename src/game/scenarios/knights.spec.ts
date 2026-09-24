import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import type { ParsedMap } from '~/game/map/load-tiled-map';
import { knightsScenario } from './knights';

/** A minimal map fixture with the given named spawn points. */
function mapWithSpawns(
  spawns: { id: string; x: number; y: number }[],
  tileSize = 32
): ParsedMap {
  return {
    width: 4,
    height: 4,
    tileSize,
    collision: new Uint8Array(16),
    spawns: spawns.map(({ id, x, y }) => ({ id, position: { x, y } })),
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

function mapWithRedBlueSpawns(): ParsedMap {
  return mapWithSpawns([
    { id: 'red', x: 32, y: 32 },
    { id: 'blue', x: 96, y: 96 },
  ]);
}

describe('knightsScenario', () => {
  it('spawns exactly one red knight and one blue knight at the spawn points', () => {
    const world = new World<Entity>();
    const map = mapWithRedBlueSpawns();

    knightsScenario.setup(world, map);

    expect(world.size).toBe(2);

    const red = [...world].filter((e) => e.team === 'red');
    const blue = [...world].filter((e) => e.team === 'blue');

    expect(red.length).toBe(1);
    expect(blue.length).toBe(1);
    expect(red[0].unitType).toBe('knight');
    expect(blue[0].unitType).toBe('knight');

    expect(red[0].transform?.position).toEqual({ x: 48, y: 48 });
    expect(blue[0].transform?.position).toEqual({ x: 112, y: 112 });
  });

  it("places the knights on the map's own tile grid when its tiles are not 32px", () => {
    const world = new World<Entity>();
    const map = mapWithSpawns(
      [
        { id: 'red', x: 45, y: 45 },
        { id: 'blue', x: 125, y: 125 },
      ],
      40
    );

    knightsScenario.setup(world, map);

    const red = [...world].find((e) => e.team === 'red');
    const blue = [...world].find((e) => e.team === 'blue');
    // Centred in 40px cells (1, 1) and (3, 3), not in the 32px cells those
    // points would fall in.
    expect(red?.transform?.position).toEqual({ x: 60, y: 60 });
    expect(blue?.transform?.position).toEqual({ x: 140, y: 140 });
  });

  it('spawns nothing when no map is given', () => {
    const world = new World<Entity>();

    knightsScenario.setup(world);

    expect(world.size).toBe(0);
  });

  describe('validateMap', () => {
    it('accepts a map with both red and blue spawn points', () => {
      expect(knightsScenario.validateMap?.(mapWithRedBlueSpawns())).toBeUndefined();
    });

    it('rejects no map at all', () => {
      expect(knightsScenario.validateMap?.(undefined)).toMatch(/no map is selected/);
    });

    it('rejects a map missing the blue spawn point', () => {
      const map = mapWithSpawns([{ id: 'red', x: 32, y: 32 }]);
      expect(knightsScenario.validateMap?.(map)).toMatch(/"blue"/);
    });

    it('rejects a map missing both spawn points', () => {
      const map = mapWithSpawns([]);
      const error = knightsScenario.validateMap?.(map);
      expect(error).toMatch(/"red"/);
      expect(error).toMatch(/"blue"/);
    });
  });
});
