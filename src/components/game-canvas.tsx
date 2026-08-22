import { useEffect, useRef } from 'react';
import {
  Application,
  Assets,
  type Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
} from 'pixi.js';
import type { Viewport } from 'pixi-viewport';

import { GameLoop } from '~/game/game-loop';
import { SystemRunner } from '~/game/ecs/system';
import { queries, world } from '~/game/ecs/world';
import type { MapDefinition } from '~/game/maps';
import { loadTiledMap, type ParsedMap, type TerrainType } from '~/game/map/loadTiledMap';
import { applyViewportBounds, createGameViewport } from '~/game/render/create-game-viewport';
import { RenderSystem } from '~/game/render/render-system';
import { CELL_SIZE } from '~/lib/grid';
import {
  serializeDebugFlags,
  type DebugFlag,
  type Scenario,
} from '~/game/scenarios';
import type { GameStats } from './debug-overlay';

/** Column each terrain type occupies in `maps/terrain-atlas.png`. */
const TERRAIN_ATLAS_COLUMN: Record<TerrainType, number> = {
  grass: 0,
  wall: 1,
  water: 2,
};

/**
 * Loads a scenario's Tiled map and draws one sprite per tile, added to
 * `worldContainer` below any existing children. Returns the parsed map so
 * the caller can spawn its units and size the camera to its bounds.
 */
async function drawTiledMap(
  mapSource: string,
  worldContainer: Container
): Promise<ParsedMap> {
  const map = await loadTiledMap(mapSource);
  const atlasUrl = `${import.meta.env.BASE_URL}maps/terrain-atlas.png`;
  const atlas = await Assets.load(atlasUrl);
  // Nearest-neighbor sampling: the atlas is flat-color placeholder art
  // packed edge-to-edge, so linear filtering bleeds neighboring tiles'
  // colors in at non-integer zoom scales, producing visible seams.
  atlas.source.scaleMode = 'nearest';

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
      worldContainer.addChild(sprite);
    }
  }

  return map;
}

/** HP knocked off every living unit per press of the debug damage key. */
const DEBUG_DAMAGE_AMOUNT = 3;

/**
 * Temporary debug scaffolding (ticket #85): pressing `H` damages every unit
 * with a `health` component by {@link DEBUG_DAMAGE_AMOUNT}, clamped at 0, so
 * the overhead health bars can be exercised in the browser (colour thresholds,
 * width, redraw-on-change) before real combat exists. T3.3 (real-time combat)
 * replaces this with actual damage sources and this function goes away.
 */
function damageAllUnits(): void {
  for (const entity of queries.living) {
    entity.health.current = Math.max(0, entity.health.current - DEBUG_DAMAGE_AMOUNT);
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

/** The camera's current pan/zoom, for consumers doing screen<->grid math. */
export interface ViewportTransform {
  x: number;
  y: number;
  scale: number;
}

export interface GameCanvasProps {
  className?: string;
  /** The scenario to seed the world with. */
  scenario: Scenario;
  /** The map to draw and pass to the scenario's `setup`. */
  map: MapDefinition;
  /**
   * Camera pan/zoom to restore on mount, e.g. parsed from `?camera=x,y,z`. Applied
   * once, after the map's bounds are known; ignored on subsequent prop
   * updates since the camera is thereafter driven by user input.
   */
  initialViewport?: ViewportTransform;
  /** Debug overlays to render, parsed from `?debug=`. */
  debugFlags?: ReadonlySet<DebugFlag>;
  /**
   * Called every rendered frame with the latest simulation stats. Kept as a ref
   * read on the caller's side so it can throttle its own re-renders.
   */
  onStats?: (stats: GameStats) => void;
  /** Called whenever the camera pans or zooms, with its latest transform. */
  onViewportChange?: (transform: ViewportTransform) => void;
}

export default function GameCanvas({
  className,
  scenario,
  map: mapProp,
  initialViewport,
  debugFlags,
  onStats,
  onViewportChange,
}: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onStatsRef = useRef(onStats);
  const onViewportChangeRef = useRef(onViewportChange);
  const scenarioRef = useRef(scenario);
  const mapRef = useRef(mapProp);
  // Read once, at mount, by the setup effect below — never re-applied on a
  // later prop change, since by then the camera is under user control.
  const initialViewportRef = useRef(initialViewport);
  const debugFlagsRef = useRef(debugFlags);
  // Set once the Pixi app is ready; re-invoked below whenever debugFlags
  // changes, so toggling a flag redraws the overlay in place instead of
  // tearing down and remounting the whole canvas.
  const syncGridRef = useRef<() => void>(() => {});
  const syncHealthBarsRef = useRef<() => void>(() => {});

  // Keep the refs pointing at the latest props without re-running the
  // Pixi-setup effect below (which must run exactly once).
  useEffect(() => {
    onStatsRef.current = onStats;
    onViewportChangeRef.current = onViewportChange;
    scenarioRef.current = scenario;
    mapRef.current = mapProp;
    debugFlagsRef.current = debugFlags;
  });

  // Debounced to the flag set's *content*, not its object identity — the
  // caller may hand us a freshly constructed Set on every render.
  const debugFlagsKey = debugFlags ? serializeDebugFlags(debugFlags) : '';
  useEffect(() => {
    syncGridRef.current();
    syncHealthBarsRef.current();
  }, [debugFlagsKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    let app: Application | undefined;
    let viewport: Viewport | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let renderSystem: RenderSystem | undefined;
    let removeKeyDownListener: (() => void) | undefined;

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
        // Adjacent tile sprites sit edge-to-edge; at the camera's fractional
        // zoom scales, unrounded sub-pixel positions leave hairline gaps
        // between them that show the background through as seams.
        roundPixels: true,
      });

      if (cancelled) {
        instance.destroy(true, { children: true, texture: true });
        return;
      }

      app = instance;
      container.appendChild(app.canvas);

      const gameViewport = createGameViewport({
        events: app.renderer.events,
        screenWidth: app.screen.width,
        screenHeight: app.screen.height,
      });
      viewport = gameViewport;
      app.stage.addChild(gameViewport);
      gameViewport.on('moved', () =>
        onViewportChangeRef.current?.({
          x: gameViewport.x,
          y: gameViewport.y,
          scale: gameViewport.scale.x,
        })
      );
      gameViewport.on('zoomed', () =>
        onViewportChangeRef.current?.({
          x: gameViewport.x,
          y: gameViewport.y,
          scale: gameViewport.scale.x,
        })
      );

      // Reactively mirrors `queries.renderable` into Pixi views: it must be
      // live before any spawning happens below so every unit — whether
      // added by the map's spawns or by the scenario's own setup — gets a
      // view, and every removal cleans its view up.
      renderSystem = new RenderSystem(
        queries.renderable,
        gameViewport,
        debugFlagsRef.current?.has('health') ?? false
      );
      syncHealthBarsRef.current = () => {
        renderSystem?.setHealthBarsVisible(debugFlagsRef.current?.has('health') ?? false);
      };

      // Draw the selected map (terrain tiles), then hand it to the
      // scenario's own setup to decide what to spawn at which of the map's
      // spawn points, and for which team. Positions live in the ECS
      // transform; the unit views are read-only and synced from it each
      // frame via `renderSystem.sync()`.
      const { mapSource } = mapRef.current;
      let map: ParsedMap | undefined;
      if (mapSource) {
        try {
          map = await drawTiledMap(mapSource, gameViewport);
          applyViewportBounds(
            gameViewport,
            map.width * map.tileSize,
            map.height * map.tileSize
          );
        } catch (error) {
          console.error(`Failed to load map "${mapSource}":`, error);
        }
      }
      if (cancelled) {
        return;
      }
      scenarioRef.current.setup(world, map);

      // Restore a saved camera position/zoom now that the map's (clamped)
      // bounds are known. Assigned directly rather than via a pan/zoom
      // gesture, so this doesn't itself fire 'moved'/'zoomed' and re-save.
      if (initialViewportRef.current) {
        const { x, y, scale } = initialViewportRef.current;
        gameViewport.scale.x = scale;
        gameViewport.scale.y = scale;
        gameViewport.x = x;
        gameViewport.y = y;
      }

      let grid: Graphics | undefined;
      const syncGrid = () => {
        grid?.destroy();
        grid = undefined;
        if (debugFlagsRef.current?.has('grid')) {
          // On top of everything (terrain tiles, units) rather than
          // `addChildAt(grid, 0)`: a map with tile sprites already occupies
          // index 0+, which buried the grid underneath them and made the
          // overlay invisible on any map with terrain (e.g. "grass").
          grid = drawGrid(gameViewport.worldWidth, gameViewport.worldHeight);
          gameViewport.addChild(grid);
        }
      };
      syncGridRef.current = syncGrid;
      syncGrid();

      app.ticker.add((ticker) => {
        loop.advance(ticker.deltaMS / 1000);

        renderSystem?.sync();

        onStatsRef.current?.({
          fps: ticker.FPS,
          tick: loop.tick,
          entities: world.size,
        });
      });

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key.toLowerCase() === 'h') {
          damageAllUnits();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      removeKeyDownListener = () => window.removeEventListener('keydown', handleKeyDown);

      resizeObserver = new ResizeObserver(([entry]) => {
        const { inlineSize: width, blockSize: height } =
          entry.contentBoxSize[0];
        app?.renderer.resize(width, height);
        gameViewport.resize(width, height, gameViewport.worldWidth, gameViewport.worldHeight);
        applyViewportBounds(
          gameViewport,
          gameViewport.worldWidth,
          gameViewport.worldHeight
        );
      });
      resizeObserver.observe(container);
    })();

    return () => {
      cancelled = true;
      removeKeyDownListener?.();
      resizeObserver?.disconnect();
      syncGridRef.current = () => {};
      syncHealthBarsRef.current = () => {};
      // Unsubscribe and destroy views before the viewport/app teardown below
      // destroys the same Pixi objects out from under it.
      renderSystem?.dispose();
      viewport?.destroy({ children: true });
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
