import { useEffect, useRef } from 'react';
import { Application, Graphics } from 'pixi.js';

import { GameLoop } from '~/game/game-loop';
import { SystemRunner } from '~/game/ecs/system';
import { queries, world } from '~/game/ecs/world';
import type { Renderable } from '~/game/ecs/types';
import { spawnInitialUnits } from '~/game/data/spawn';
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

export interface GameCanvasProps {
  className?: string;
  /**
   * Called every rendered frame with the latest simulation stats. Kept as a ref
   * read on the caller's side so it can throttle its own re-renders.
   */
  onStats?: (stats: GameStats) => void;
}

export default function GameCanvas({ className, onStats }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onStatsRef = useRef(onStats);

  // Keep the ref pointing at the latest callback without re-running the
  // Pixi-setup effect below (which must run exactly once).
  useEffect(() => {
    onStatsRef.current = onStats;
  });

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

      // Seed the world with some units, then draw one Graphics view per
      // renderable entity. Positions live in the ECS transform; the view is
      // read-only and synced from it each frame.
      spawnInitialUnits(world);

      const views = new Map<(typeof queries.renderable.entities)[number], Graphics>();
      for (const entity of queries.renderable) {
        const view = drawRenderable(entity.renderable);
        views.set(entity, view);
        app.stage.addChild(view);
      }

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
      });
      resizeObserver.observe(container);
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
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
