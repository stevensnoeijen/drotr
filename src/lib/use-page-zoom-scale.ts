import { useEffect, useRef, useState } from 'react';

/**
 * Counter-scale factor that keeps an element's on-screen (physical) size
 * fixed as the browser's own page zoom (Ctrl+scroll / pinch) changes,
 * independent of the game's own camera zoom (which is a Pixi viewport
 * transform, not a browser one, and doesn't affect the DOM at all).
 *
 * Desktop browser zoom scales `window.devicePixelRatio` by the zoom
 * factor (e.g. 1.1x at 110%), so the ratio between the current value and
 * the one captured on mount is exactly the zoom factor to cancel out via
 * `transform: scale(1 / factor)`.
 */
export function usePageZoomCounterScale(): number {
  const baselineDprRef = useRef<number | undefined>(undefined);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    baselineDprRef.current ??= window.devicePixelRatio;

    const updateScale = () => {
      const baseline = baselineDprRef.current;
      if (baseline) {
        setScale(baseline / window.devicePixelRatio);
      }
    };

    // Desktop browsers fire 'resize' when zoom (and so devicePixelRatio)
    // changes; there's no dedicated zoom-change event.
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  return scale;
}
