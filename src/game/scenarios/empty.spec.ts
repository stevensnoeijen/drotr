import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import type { Entity } from '~/game/ecs/entity';
import type { ParsedMap } from '~/game/map/load-tiled-map';
import { emptyScenario } from './empty';
import { scenarios } from './index';

/** A minimal map fixture with a spawn point `setup` could have used. */
function mapWithSpawn(): ParsedMap {
  return {
    width: 4,
    height: 4,
    tileSize: 32,
    collision: new Uint8Array(16),
    spawns: [{ id: 'red', position: { x: 32, y: 32 } }],
    tileset: {
      firstgid: 1,
      tileWidth: 32,
      tileHeight: 32,
      tileCount: 0,
      columns: 1,
      imageUrl: '',
    },
    tileLayers: [],
  };
}

describe('emptyScenario', () => {
  it('is registered as `empty`', () => {
    expect(emptyScenario.id).toBe('empty');
    expect(scenarios).toContain(emptyScenario);
  });

  it('spawns no entities on a map', () => {
    const world = new World<Entity>();
    emptyScenario.setup(world, mapWithSpawn());
    expect(world.size).toBe(0);
  });

  it('spawns no entities without a map', () => {
    const world = new World<Entity>();
    emptyScenario.setup(world);
    expect(world.size).toBe(0);
  });

  it('needs nothing from the map and is allowed on every map', () => {
    expect(emptyScenario.validateMap).toBeUndefined();
    expect(emptyScenario.allowedOnEveryMap).toBe(true);
  });
});
