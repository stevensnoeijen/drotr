import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { usePageZoomCounterScale } from './use-page-zoom-scale';

describe('usePageZoomCounterScale', () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalDpr: number;

  function Probe({ onScale }: { onScale: (scale: number) => void }) {
    onScale(usePageZoomCounterScale());
    return null;
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    originalDpr = window.devicePixelRatio;
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

    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalDpr * 1.1,
      configurable: true,
    });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(scale).toBeCloseTo(1 / 1.1);
  });

  it('counter-scales up when devicePixelRatio falls (page zoomed out)', () => {
    let scale = 0;
    act(() => {
      root.render(<Probe onScale={(s) => (scale = s)} />);
    });

    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalDpr * 0.9,
      configurable: true,
    });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(scale).toBeCloseTo(1 / 0.9);
  });
});
