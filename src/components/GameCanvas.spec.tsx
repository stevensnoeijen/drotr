import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GameCanvas from './GameCanvas';

interface MockApplication {
  canvas: HTMLCanvasElement;
  renderer: { resize: ReturnType<typeof vi.fn> };
  init: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

let instances: MockApplication[] = [];

vi.mock('pixi.js', () => {
  class Application implements MockApplication {
    canvas = document.createElement('canvas');
    renderer = { resize: vi.fn() };
    init = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn();

    constructor() {
      instances.push(this);
    }
  }

  return { Application };
});

describe('GameCanvas', () => {
  beforeEach(() => {
    instances = [];
  });

  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('destroys the pixi Application on unmount', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(<GameCanvas />);
    });

    expect(instances).toHaveLength(1);
    const [app] = instances;
    expect(container.querySelector('canvas')).toBe(app.canvas);

    act(() => {
      root.unmount();
    });

    expect(app.destroy).toHaveBeenCalledWith(true, {
      children: true,
      texture: true,
    });
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('survives StrictMode double-mount with exactly one live Application', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <GameCanvas />
        </StrictMode>
      );
    });

    expect(instances).toHaveLength(2);
    const destroyed = instances.filter((app) => app.destroy.mock.calls.length > 0);
    const survivors = instances.filter((app) => app.destroy.mock.calls.length === 0);

    expect(destroyed).toHaveLength(1);
    expect(survivors).toHaveLength(1);

    const canvases = container.querySelectorAll('canvas');
    expect(canvases).toHaveLength(1);
    expect(canvases[0]).toBe(survivors[0].canvas);

    act(() => {
      root.unmount();
    });
  });
});
