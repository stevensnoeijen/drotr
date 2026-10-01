import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import type { ParsedMap } from '~/game/map/load-tiled-map';
import { createSeededRandom } from '~/lib/random';
import { createKnightsScenario, knightsScenario } from './knights';

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
    },
    tileLayers: [],
    objectLayers: [],
  };
}

/** Four spawns, one per 32px tile along the diagonal, at each tile's centre like a real map's. */
function mapWithFourSpawns(): ParsedMap {
  return mapWithSpawns(
    [0, 1, 2, 3].map((i) => ({ id: `edge-${i + 1}`, x: i * 32 + 16, y: i * 32 + 16 }))
  );
}

/** A source that returns `values` in turn. */
function scripted(...values: number[]): () => number {
  return () => {
    const value = values.shift();
    if (value === undefined) throw new Error('scripted random ran out');
    return value;
  };
}

function knights(world: World<Entity>) {
  const red = [...world].filter((e) => e.team === 'red');
  const blue = [...world].filter((e) => e.team === 'blue');
  return { red, blue };
}

describe('knightsScenario', () => {
  it('spawns exactly one red knight and one blue knight', () => {
    const world = new World<Entity>();

    createKnightsScenario(createSeededRandom(1)).setup(
      world,
      mapWithFourSpawns()
    );

    const { red, blue } = knights(world);
    expect(world.size).toBe(2);
    expect(red.map((e) => e.unitType)).toEqual(['knight']);
    expect(blue.map((e) => e.unitType)).toEqual(['knight']);
  });

  it('places the knights on the randomly drawn spawn points', () => {
    const world = new World<Entity>();

    // 0.5 of 4 draws edge-3 (tile 2, 2) for red; then 0.9 of the remaining
    // 3 draws the last one, edge-4 (tile 3, 3), for blue. Each knight's 2x2
    // block of 16px cells covers its spawn tile exactly, centred on it.
    createKnightsScenario(scripted(0.5, 0.9)).setup(world, mapWithFourSpawns());

    const { red, blue } = knights(world);
    expect(red[0].transform?.position).toEqual({ x: 80, y: 80 });
    expect(blue[0].transform?.position).toEqual({ x: 112, y: 112 });
  });

  it('with a seeded source, always lands the two knights on two distinct map spawn points', () => {
    const map = mapWithFourSpawns();
    // Map spawn points sit at tile centres, which a knight's 2x2 block of
    // half-tile cells covers exactly — so the block's own resting centre is
    // the spawn point itself, with no further offset to add.
    const spawnCentres = map.spawns.map(({ position }) => ({ ...position }));

    for (let seed = 0; seed < 50; seed++) {
      const world = new World<Entity>();
      createKnightsScenario(createSeededRandom(seed)).setup(world, map);

      const { red, blue } = knights(world);
      const redPosition = red[0].transform!.position;
      const bluePosition = blue[0].transform!.position;
      expect(spawnCentres).toContainEqual(redPosition);
      expect(spawnCentres).toContainEqual(bluePosition);
      expect(redPosition).not.toEqual(bluePosition);
    }
  });

  it('makes the same choice for the same seed', () => {
    const positions = () => {
      const world = new World<Entity>();
      createKnightsScenario(createSeededRandom(123)).setup(
        world,
        mapWithFourSpawns()
      );
      const { red, blue } = knights(world);
      return [red[0].transform?.position, blue[0].transform?.position];
    };

    expect(positions()).toEqual(positions());
  });

  it("places the knights on the map's half-tile grid when its tiles are not 32px", () => {
    const world = new World<Entity>();
    const map = mapWithSpawns(
      [
        { id: 'edge-1', x: 45, y: 45 },
        { id: 'edge-2', x: 125, y: 125 },
      ],
      40
    );

    // 0 of 2 draws edge-1 for red, leaving edge-2 for blue.
    createKnightsScenario(scripted(0, 0)).setup(world, map);

    const { red, blue } = knights(world);
    // On the corners at the middle of 2x2 blocks of 20px cells — (40, 40)
    // and (120, 120) — not the 16px cells a 32px-tile map would use.
    expect(red[0].transform?.position).toEqual({ x: 40, y: 40 });
    expect(blue[0].transform?.position).toEqual({ x: 120, y: 120 });
  });

  it('spawns nothing when no map is given', () => {
    const world = new World<Entity>();

    knightsScenario.setup(world);

    expect(world.size).toBe(0);
  });

  it('spawns nothing on a map with fewer than 2 spawn points', () => {
    const world = new World<Entity>();

    knightsScenario.setup(world, mapWithSpawns([{ id: 'edge-1', x: 0, y: 0 }]));

    expect(world.size).toBe(0);
  });

  describe('validateMap', () => {
    it('accepts a map with 2 or more spawn points, whatever their names', () => {
      expect(
        knightsScenario.validateMap?.(
          mapWithSpawns([
            { id: 'anywhere', x: 0, y: 0 },
            { id: 'elsewhere', x: 32, y: 32 },
          ])
        )
      ).toBeUndefined();
      expect(
        knightsScenario.validateMap?.(mapWithFourSpawns())
      ).toBeUndefined();
    });

    it('rejects no map at all', () => {
      expect(knightsScenario.validateMap?.(undefined)).toMatch(
        /no map is selected/
      );
    });

    it('rejects a map with only 1 spawn point', () => {
      const map = mapWithSpawns([{ id: 'edge-1', x: 32, y: 32 }]);
      expect(knightsScenario.validateMap?.(map)).toMatch(
        /at least 2 spawn points, but it has 1/
      );
    });

    it('rejects a map with no spawn points', () => {
      expect(knightsScenario.validateMap?.(mapWithSpawns([]))).toMatch(
        /at least 2 spawn points, but it has 0/
      );
    });
  });
});
