import { useEffect, useRef } from 'react';
import { Application, Graphics } from 'pixi.js';

import { GameLoop } from '~/game/GameLoop';
import { SystemRunner } from '~/game/ecs/System';
import { world } from '~/game/ecs/world';
import type { GameStats } from './debug-overlay';

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

      const sprite = new Graphics()
        .rect(0, 0, 64, 64)
        .fill(0x66ccff);
      sprite.position.set(32, 32);
      app.stage.addChild(sprite);

      app.ticker.add((ticker) => {
        loop.advance(ticker.deltaMS / 1000);
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
      }
    };
  }, []);

  return <div ref={containerRef} className={className} />;
}
