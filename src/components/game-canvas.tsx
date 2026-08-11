import { useEffect, useRef } from 'react';
import { Application, Graphics } from 'pixi.js';

import { GameLoop } from '~/game/game-loop';
import { SystemRunner } from '~/game/ecs/system';
import { queries, world } from '~/game/ecs/world';
import type { Renderable } from '~/game/ecs/types';
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

      // Seed the world from the resolved scenario, then draw one Graphics
      // view per renderable entity. Positions live in the ECS transform; the
      // view is read-only and synced from it each frame.
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
