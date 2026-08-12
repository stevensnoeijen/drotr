import type { Scenario } from './types';

/**
 * Loads `grass.tmj`, a small Tiled fixture map, and renders its terrain and
 * spawn points for real via PixiJS. Map-driven spawning happens in
 * `GameCanvas` (see `mapSource`); `setup` has nothing left to do.
 */
export const grassScenario: Scenario = {
  id: 'grass',
  title: 'Grass',
  description:
    'Loads a Tiled test map and renders its terrain and spawns via PixiJS.',
  map: 'grass',
  mapSource: `${import.meta.env.BASE_URL}maps/grass.tmj`,
  setup: () => {},
};
