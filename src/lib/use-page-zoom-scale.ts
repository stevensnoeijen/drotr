import { useEffect, useRef, useState } from 'react';

/**
 * Counter-scale never goes below/above this, however extreme the detected
 * zoom delta — guards against the overlay vanishing (scale collapsing
 * toward 0) or ballooning off-screen from a bad/NaN reading, rather than
 * trusting the zoom-detection math to always produce something sane.
 */
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

function clampScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) {
    return 1;
  }
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

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
 *
 * Detects the change via a `matchMedia('(resolution: ...)')` listener
 * re-armed on every fire, rather than the `resize` event — `resize` isn't
 * reliably fired by every zoom gesture in every browser, which left this
 * silently stuck at a stale scale (in the worst case shrunk enough to look
 * like the overlay had disappeared) until some other resize happened to
 * fire. `matchMedia` on `resolution` is the standard cross-browser
 * technique for observing devicePixelRatio/zoom changes directly.
 */
export function usePageZoomCounterScale(): number {
  const baselineDprRef = useRef<number | undefined>(undefined);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    // Environments without matchMedia (older browsers, jsdom in tests)
    // just keep the overlay at scale 1 rather than crashing.
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    baselineDprRef.current ??= window.devicePixelRatio;

    let media: MediaQueryList;
    const rearm = () => {
      const baseline = baselineDprRef.current;
      if (baseline) {
        setScale(clampScale(baseline / window.devicePixelRatio));
      }
      media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      media.addEventListener('change', rearm, { once: true });
    };
    rearm();

    return () => media.removeEventListener('change', rearm);
  }, []);

  return scale;
}
