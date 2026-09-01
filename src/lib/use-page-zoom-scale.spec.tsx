import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { usePageZoomCounterScale } from './use-page-zoom-scale';

describe('usePageZoomCounterScale', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalDpr: number;
  let originalMatchMedia: typeof window.matchMedia;
  let currentChangeListener: (() => void) | null;

  function Probe({ onScale }: { onScale: (scale: number) => void }) {
    onScale(usePageZoomCounterScale());
    return null;
  }

  /** Simulates the browser zoom (and so devicePixelRatio) actually changing. */
  function zoomTo(dpr: number) {
    Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true });
    act(() => {
      currentChangeListener?.();
    });
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    originalDpr = window.devicePixelRatio;
    originalMatchMedia = window.matchMedia;
    currentChangeListener = null;

    // jsdom has no real matchMedia/resolution-query support; stand in a
    // fake that just remembers the latest 'change' listener the hook
    // registered, so a test can fire it directly to simulate a zoom.
    window.matchMedia = ((query: string) => {
      currentChangeListener = null;
      return {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: (_event: string, cb: () => void) => {
          currentChangeListener = cb;
        },
        removeEventListener: () => {
          currentChangeListener = null;
        },
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as unknown as MediaQueryList;
    }) as typeof window.matchMedia;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalDpr,
      configurable: true,
    });
    window.matchMedia = originalMatchMedia;
  });

  it('starts at scale 1', () => {
    let scale = 0;
    act(() => {
      root.render(<Probe onScale={(s) => (scale = s)} />);
    });

    expect(scale).toBe(1);
  });

  it('counter-scales down when devicePixelRatio rises (page zoomed in)', () => {
    let scale = 0;
    act(() => {
      root.render(<Probe onScale={(s) => (scale = s)} />);
    });

    zoomTo(originalDpr * 1.1);

    expect(scale).toBeCloseTo(1 / 1.1);
  });

  it('counter-scales up when devicePixelRatio falls (page zoomed out)', () => {
    let scale = 0;
    act(() => {
      root.render(<Probe onScale={(s) => (scale = s)} />);
    });

    zoomTo(originalDpr * 0.9);

    expect(scale).toBeCloseTo(1 / 0.9);
  });

  it('keeps responding to further zoom changes after the first one', () => {
    let scale = 0;
    act(() => {
      root.render(<Probe onScale={(s) => (scale = s)} />);
    });

    zoomTo(originalDpr * 1.1);
    expect(scale).toBeCloseTo(1 / 1.1);

    zoomTo(originalDpr * 2);
    expect(scale).toBeCloseTo(1 / 2);
  });

  it('never collapses to an invisible or non-finite scale on a bad reading', () => {
    let scale = 0;
    act(() => {
      root.render(<Probe onScale={(s) => (scale = s)} />);
    });

    zoomTo(0);

    expect(Number.isFinite(scale)).toBe(true);
    expect(scale).toBeGreaterThan(0);
  });
});
