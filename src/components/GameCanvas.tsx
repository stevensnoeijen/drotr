import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';

export interface GameCanvasProps {
  className?: string;
}

export default function GameCanvas({ className }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    let app: Application | undefined;
    let resizeObserver: ResizeObserver | undefined;

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
