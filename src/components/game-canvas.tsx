import { useEffect, useRef } from 'react';
import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
} from 'pixi.js';
import type { Viewport } from 'pixi-viewport';

import { GameLoop } from '~/game/game-loop';
import { SystemRunner } from '~/game/ecs/system';
import { findEntityById, queries, world } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import type { MapDefinition } from '~/game/maps';
import { loadTiledMap, type ParsedMap, type TerrainType } from '~/game/map/loadTiledMap';
import { applyViewportBounds, createGameViewport } from '~/game/render/create-game-viewport';
import { RenderSystem } from '~/game/render/render-system';
import { drawTargetLines } from '~/game/render/target-lines';
import { drawMoveLines } from '~/game/render/move-lines';
import { CameraPanSystem } from '~/game/systems/camera-pan-system';
import { createCombatSystem } from '~/game/systems/combat-system';
import { createInputSystem, InputSystem, findHoverableUnitAt } from '~/game/systems/input-system';
import { createMovePathSystem } from '~/game/systems/move-path-system';
import { createMoveTargetSystem } from '~/game/systems/move-target-system';
import { createMoveVelocitySystem } from '~/game/systems/move-velocity-system';
import { createPerceptionSystem, runPerceptionScan } from '~/game/systems/perception-system';
import { createSeekSystem } from '~/game/systems/seek-system';
import { createSelectionBoxSystem, SelectionBoxDrag } from '~/game/systems/selection-box-system';
import { CELL_SIZE, screenToGrid, screenToWorld } from '~/lib/grid';
import {
  serializeDebugFlags,
  type DebugFlag,
  type Scenario,
} from '~/game/scenarios';
import type { GameStats } from './debug-overlay';
import { units } from '~/game/data/units';

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

/**
 * Draws a light grid overlay over the given canvas size, for `?debug=grid`.
 * `cellSize` should be the loaded map's actual tile size, not
 * {@link CELL_SIZE} (the coarser unit-placement grid) — a map's tiles can be
 * smaller than a unit's placement cell, and drawing lines at the wrong
 * spacing makes the overlay cut through tiles (walls included) instead of
 * outlining them.
 */
function drawGrid(width: number, height: number, cellSize: number): Graphics {
  const graphics = new Graphics();
  for (let x = 0; x <= width; x += cellSize) {
    graphics.moveTo(x, 0).lineTo(x, height);
  }
  for (let y = 0; y <= height; y += cellSize) {
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
    let inputSystem: InputSystem | undefined;
    let selectionBoxDrag: SelectionBoxDrag | undefined;
    let cameraPanSystem: CameraPanSystem | undefined;
    let removePointerMoveListener: (() => void) | undefined;

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
      // Screen-space overlay, above the world container, for the
      // drag-select box: it must stay put on screen while the camera pans
      // underneath it, unlike everything added to `gameViewport`.
      const selectionOverlay = new Container();
      app.stage.addChild(selectionOverlay);
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

      // Units can spawn already within each other's aggro range; run one
      // scan immediately rather than leaving them untargeted until the
      // periodic system's first interval elapses.
      runPerceptionScan(world, queries);

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

      const getViewportTransform = () => ({
        x: gameViewport.x,
        y: gameViewport.y,
        scale: gameViewport.scale.x,
      });
      const mapBounds = map ? { width: map.width, height: map.height } : undefined;

      // The map doubles as the pathfinder's collision grid (same `width`,
      // `height` and row-major `collision` buffer). Only handed over when
      // its tiles are the same size as the unit-placement cell the ECS uses
      // (`CELL_SIZE`), since the world<->cell conversion in
      // `planMovePath` assumes one grid, not two at different resolutions;
      // a mismatched map falls back to straight-line orders rather than
      // routing through cells that don't line up with its terrain.
      let navigationGrid: ParsedMap | undefined;
      if (map) {
        if (map.tileSize === CELL_SIZE) {
          navigationGrid = map;
        } else {
          console.warn(
            `Map tile size (${map.tileSize}) differs from CELL_SIZE (${CELL_SIZE}); move orders will not be routed around terrain.`
          );
        }
      }

      const canvas = app.canvas;
      inputSystem = new InputSystem(canvas);
      runner.add(createInputSystem(inputSystem, queries, getViewportTransform, navigationGrid));

      selectionBoxDrag = new SelectionBoxDrag(canvas, selectionOverlay);
      runner.add(createSelectionBoxSystem(selectionBoxDrag, queries, getViewportTransform));

      runner.add(createPerceptionSystem(queries));
      // Seek reads the target set above/by the periodic scan; movement
      // integrates the velocity seek just set, both within the same fixed
      // step so a freshly (re)targeted unit starts moving immediately.
      runner.add(createSeekSystem(queries));
      // Runs after SeekSystem so a player-issued move order (right-click)
      // takes priority over auto-attack seeking for any unit that somehow
      // has both: MoveTargetSystem's velocity write wins going into the
      // integration step below. MovePathSystem goes first of the two so a
      // route's next waypoint is steered toward in the same tick it's
      // handed over, rather than costing an idle frame per leg.
      runner.add(createMovePathSystem(queries));
      runner.add(createMoveTargetSystem(queries));
      runner.add(createMoveVelocitySystem(queries));
      // Last in the step, after the integration above: a unit that arrives at
      // `attackRange` this tick swings from where it now stands, and any
      // damage it deals lands before `renderSystem.sync()` runs for the
      // frame, so the health bar redraws in the very same frame.
      runner.add(createCombatSystem(queries));

      cameraPanSystem = new CameraPanSystem(canvas);

      let hoveredCell: { x: number; y: number } | undefined;
      let hoveredUnit: Entity | undefined;
      let pointerPosition: { x: number; y: number } | undefined;
      const handlePointerMove = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const screenPos = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        pointerPosition = { x: event.clientX, y: event.clientY };
        hoveredCell = screenToGrid(screenPos, getViewportTransform(), mapBounds);

        // Track hovered unit for unit-info debug flag (checks all hoverable units, including red team)
        if (debugFlagsRef.current?.has('unit-info')) {
          const worldPos = screenToWorld(screenPos, getViewportTransform());
          hoveredUnit = findHoverableUnitAt(queries, worldPos);
        } else {
          hoveredUnit = undefined;
        }
      };
      canvas.addEventListener('pointermove', handlePointerMove);
      removePointerMoveListener = () => canvas.removeEventListener('pointermove', handlePointerMove);

      let grid: Graphics | undefined;
      const syncGrid = () => {
        grid?.destroy();
        grid = undefined;
        if (debugFlagsRef.current?.has('grid')) {
          // On top of everything (terrain tiles, units) rather than
          // `addChildAt(grid, 0)`: a map with tile sprites already occupies
          // index 0+, which buried the grid underneath them and made the
          // overlay invisible on any map with terrain (e.g. "grass").
          grid = drawGrid(
            gameViewport.worldWidth,
            gameViewport.worldHeight,
            map?.tileSize ?? CELL_SIZE
          );
          gameViewport.addChild(grid);
        }
      };
      syncGridRef.current = syncGrid;
      syncGrid();

      // Redrawn every frame (below, in the ticker) rather than only on
      // toggle, since — unlike the grid — the lines it draws move with the
      // units.
      const targetLines = new Graphics();
      gameViewport.addChild(targetLines);

      const moveLines = new Graphics();
      gameViewport.addChild(moveLines);

      app.ticker.add((ticker) => {
        loop.advance(ticker.deltaMS / 1000);
        cameraPanSystem?.update(gameViewport, ticker.deltaMS / 1000);

        renderSystem?.sync();

        if (debugFlagsRef.current?.has('targets')) {
          drawTargetLines(targetLines, queries.combatants);
        } else {
          targetLines.clear();
        }

        if (debugFlagsRef.current?.has('paths')) {
          drawMoveLines(moveLines, queries.movable);
        } else {
          moveLines.clear();
        }

        // Resolves an entity's `target.entityId` (if any) back to the
        // targeted entity's id/type, for the entity debug dialog.
        const resolveTarget = (entity: Entity | undefined) => {
          if (!entity?.target) {
            return undefined;
          }
          const targetEntity = findEntityById(queries.combatants, entity.target.entityId);
          return targetEntity ? { id: targetEntity.id, type: targetEntity.unitType } : undefined;
        };

        // Extract combat stats from the hovered unit (unit-info debug flag only)
        const hoveredUnitStats =
          debugFlagsRef.current?.has('unit-info') && hoveredUnit?.unitType
            ? {
                id: hoveredUnit.id,
                type: hoveredUnit.unitType,
                team: hoveredUnit.team,
                color: hoveredUnit.renderable?.color,
                damage: units[hoveredUnit.unitType]?.attackDamage,
                attackCooldown: units[hoveredUnit.unitType]?.attackCooldown,
                accuracy: units[hoveredUnit.unitType]?.accuracy,
                defence: units[hoveredUnit.unitType]?.defence,
                stamina: units[hoveredUnit.unitType]?.stamina,
                speed: units[hoveredUnit.unitType]?.speed,
                range: units[hoveredUnit.unitType]?.range,
                target: resolveTarget(hoveredUnit),
              }
            : undefined;

        onStatsRef.current?.({
          fps: ticker.FPS,
          tick: loop.tick,
          entities: world.size,
          hoveredCell,
          hoveredUnitStats,
          pointerPosition,
        });
      });

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
      removePointerMoveListener?.();
      resizeObserver?.disconnect();
      syncGridRef.current = () => {};
      syncHealthBarsRef.current = () => {};
      // Unsubscribe and destroy views before the viewport/app teardown below
      // destroys the same Pixi objects out from under it.
      inputSystem?.dispose();
      selectionBoxDrag?.dispose();
      cameraPanSystem?.dispose();
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
