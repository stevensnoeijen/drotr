import { useEffect, useRef } from 'react';
import { Application, Assets, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';

import { spawnUnit } from '~/game/data/spawn';
import { GameLoop } from '~/game/game-loop';
import { SystemRunner } from '~/game/ecs/system';
import { queries, world } from '~/game/ecs/world';
import type { Renderable } from '~/game/ecs/types';
import { loadTiledMap, type TerrainType } from '~/game/map/loadTiledMap';
import { CELL_SIZE } from '~/lib/grid';
import {
  serializeDebugFlags,
  type DebugFlag,
  type Scenario,
} from '~/game/scenarios';
import type { GameStats } from './debug-overlay';

/** Draws a {@link Renderable}'s primitive shape into a fresh Graphics. */
function drawRenderable({ shape, color, size }: Renderable): Graphics {
  const graphics = new Graphics();
  if (shape === 'circle') {
    graphics.circle(0, 0, size);
  } else {
    graphics.rect(-size, -size, size * 2, size * 2);
  }
  return graphics.fill(color);
}

/** Column each terrain type occupies in `maps/terrain-atlas.png`. */
const TERRAIN_ATLAS_COLUMN: Record<TerrainType, number> = {
  grass: 0,
  wall: 1,
  water: 2,
};

/**
 * Loads a scenario's Tiled map and draws one sprite per tile plus one unit
 * per spawn point, added to `stage` below any existing children.
 */
async function drawTiledMap(
  mapSource: string,
  stage: Application['stage']
): Promise<void> {
  const map = await loadTiledMap(mapSource);
  const atlasUrl = `${import.meta.env.BASE_URL}maps/terrain-atlas.png`;
  const atlas = await Assets.load(atlasUrl);

  const terrainTextures: Record<TerrainType, Texture> = {
    grass: new Texture({
      source: atlas.source,
      frame: new Rectangle(
        TERRAIN_ATLAS_COLUMN.grass * map.tileSize,
        0,
        map.tileSize,
        map.tileSize
      ),
    }),
    wall: new Texture({
      source: atlas.source,
      frame: new Rectangle(
        TERRAIN_ATLAS_COLUMN.wall * map.tileSize,
        0,
        map.tileSize,
        map.tileSize
      ),
    }),
    water: new Texture({
      source: atlas.source,
      frame: new Rectangle(
        TERRAIN_ATLAS_COLUMN.water * map.tileSize,
        0,
        map.tileSize,
        map.tileSize
      ),
    }),
  };

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const sprite = new Sprite(terrainTextures[map.terrain[y][x]]);
      sprite.position.set(x * map.tileSize, y * map.tileSize);
      stage.addChild(sprite);
    }
  }

  for (const spawn of map.spawns) {
    spawnUnit(world, {
      type: spawn.unitType,
      team: spawn.team,
      position: spawn.position,
    });
  }
}

/** Draws a light grid overlay over the given canvas size, for `?debug=grid`. */
function drawGrid(width: number, height: number): Graphics {
  const graphics = new Graphics();
  for (let x = 0; x <= width; x += CELL_SIZE) {
    graphics.moveTo(x, 0).lineTo(x, height);
  }
  for (let y = 0; y <= height; y += CELL_SIZE) {
    graphics.moveTo(0, y).lineTo(width, y);
  }
  return graphics.stroke({ width: 1, color: 0xffffff, alpha: 0.15 });
}

export interface GameCanvasProps {
  className?: string;
  /** The scenario to seed the world with. */
  scenario: Scenario;
  /** Debug overlays to render, parsed from `?debug=`. */
  debugFlags?: ReadonlySet<DebugFlag>;
  /**
   * Called every rendered frame with the latest simulation stats. Kept as a ref
   * read on the caller's side so it can throttle its own re-renders.
   */
  onStats?: (stats: GameStats) => void;
}

export default function GameCanvas({
  className,
  scenario,
  debugFlags,
  onStats,
}: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onStatsRef = useRef(onStats);
  const scenarioRef = useRef(scenario);
  const debugFlagsRef = useRef(debugFlags);
  // Set once the Pixi app is ready; re-invoked below whenever debugFlags
  // changes, so toggling a flag redraws the overlay in place instead of
  // tearing down and remounting the whole canvas.
  const syncGridRef = useRef<() => void>(() => {});

  // Keep the refs pointing at the latest props without re-running the
  // Pixi-setup effect below (which must run exactly once).
  useEffect(() => {
    onStatsRef.current = onStats;
    scenarioRef.current = scenario;
    debugFlagsRef.current = debugFlags;
  });

  // Debounced to the flag set's *content*, not its object identity — the
  // caller may hand us a freshly constructed Set on every render.
  const debugFlagsKey = debugFlags ? serializeDebugFlags(debugFlags) : '';
  useEffect(() => {
    syncGridRef.current();
  }, [debugFlagsKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    let app: Application | undefined;
    let resizeObserver: ResizeObserver | undefined;

    // No systems yet (#78 is the contract only); the runner is empty but the
    // loop still advances the tick count so the debug overlay can show it.
    const runner = new SystemRunner();
    const loop = new GameLoop({ update: (dt) => runner.run(world, dt) });

    (async () => {
      const instance = new Application();
      await instance.init({
        resizeTo: container,
        background: '#000000',
        antialias: true,
        preference: 'webgl',
      });

      if (cancelled) {
        instance.destroy(true, { children: true, texture: true });
        return;
      }

      app = instance;
      container.appendChild(app.canvas);

      // Draw the scenario's map (terrain tiles + map-driven spawns), if it
      // has one, then seed the world from the scenario itself. Positions
      // live in the ECS transform; the unit views below are read-only and
      // synced from it each frame.
      const { mapSource } = scenarioRef.current;
      if (mapSource) {
        try {
          await drawTiledMap(mapSource, app.stage);
        } catch (error) {
          console.error(`Failed to load map "${mapSource}":`, error);
        }
      }
      if (cancelled) {
        return;
      }
      scenarioRef.current.setup(world);

      const views = new Map<(typeof queries.renderable.entities)[number], Graphics>();
      for (const entity of queries.renderable) {
        const view = drawRenderable(entity.renderable);
        views.set(entity, view);
        app.stage.addChild(view);
      }

      let grid: Graphics | undefined;
      const syncGrid = () => {
        if (!app) {
          return;
        }
        grid?.destroy();
        grid = undefined;
        if (debugFlagsRef.current?.has('grid')) {
          grid = drawGrid(app.screen.width, app.screen.height);
          app.stage.addChildAt(grid, 0);
        }
      };
      syncGridRef.current = syncGrid;
      syncGrid();

      app.ticker.add((ticker) => {
        loop.advance(ticker.deltaMS / 1000);

        for (const [entity, view] of views) {
          view.position.set(
            entity.transform.position.x,
            entity.transform.position.y
          );
          view.rotation = entity.transform.rotation;
        }

        onStatsRef.current?.({
          fps: ticker.FPS,
          tick: loop.tick,
          entities: world.size,
        });
      });

      resizeObserver = new ResizeObserver(([entry]) => {
        const { inlineSize: width, blockSize: height } =
          entry.contentBoxSize[0];
        app?.renderer.resize(width, height);
        syncGrid();
      });
      resizeObserver.observe(container);
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      syncGridRef.current = () => {};
      if (app) {
        app.canvas.remove();
        app.destroy(true, { children: true, texture: true });
        // Only the surviving mount reaches here with a live `app`; clear the
        // units it seeded so a remount starts from an empty world instead of
        // stacking duplicate entities.
        world.clear();
      }
    };
  }, []);

  return <div ref={containerRef} className={className} />;
}
