import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GameCanvas from './game-canvas';
import type { Scenario } from '~/game/scenarios';

const scenario: Scenario = {
  id: 'test',
  title: 'Test',
  description: 'Test scenario for GameCanvas specs.',
  map: 'empty',
  setup: () => {},
};

interface MockApplication {
  canvas: HTMLCanvasElement;
  renderer: { resize: ReturnType<typeof vi.fn>; events: object };
  stage: { addChild: ReturnType<typeof vi.fn> };
  screen: { width: number; height: number };
  ticker: { add: ReturnType<typeof vi.fn>; FPS: number };
  init: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

let instances: MockApplication[] = [];
let viewportInstances: MockViewport[] = [];

interface MockViewport {
  addChild: ReturnType<typeof vi.fn>;
  addChildAt: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  drag: ReturnType<typeof vi.fn>;
  pinch: ReturnType<typeof vi.fn>;
  wheel: ReturnType<typeof vi.fn>;
  clamp: ReturnType<typeof vi.fn>;
  clampZoom: ReturnType<typeof vi.fn>;
  resize: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  worldWidth: number;
  worldHeight: number;
  screenWidth: number;
  screenHeight: number;
  x: number;
  y: number;
  scale: { x: number };
}

vi.mock('pixi.js', () => {
  class Application implements MockApplication {
    canvas = document.createElement('canvas');
    renderer = { resize: vi.fn(), events: {} };
    stage = { addChild: vi.fn() };
    screen = { width: 800, height: 600 };
    ticker = { add: vi.fn(), FPS: 0 };
    init = vi.fn().mockResolvedValue(undefined);
    destroy = vi.fn();

    constructor() {
      instances.push(this);
    }
  }

  class Graphics {
    position = { set: vi.fn() };
    rotation = 0;
    rect = vi.fn().mockReturnThis();
    circle = vi.fn().mockReturnThis();
    fill = vi.fn().mockReturnThis();
  }

  return { Application, Graphics };
});

vi.mock('pixi-viewport', () => {
  class Viewport implements MockViewport {
    addChild = vi.fn();
    addChildAt = vi.fn();
    on = vi.fn();
    drag = vi.fn().mockReturnThis();
    pinch = vi.fn().mockReturnThis();
    wheel = vi.fn().mockReturnThis();
    clamp = vi.fn().mockReturnThis();
    clampZoom = vi.fn().mockReturnThis();
    resize = vi.fn();
    destroy = vi.fn();
    worldWidth = 800;
    worldHeight = 600;
    screenWidth = 800;
    screenHeight = 600;
    x = 0;
    y = 0;
    scale = { x: 1 };

    constructor() {
      viewportInstances.push(this);
    }
  }

  return { Viewport };
});

describe('GameCanvas', () => {
  beforeEach(() => {
    instances = [];
    viewportInstances = [];
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
      root.render(<GameCanvas scenario={scenario} />);
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

    expect(viewportInstances).toHaveLength(1);
    expect(viewportInstances[0].destroy).toHaveBeenCalledWith({
      children: true,
    });
  });

  it('survives StrictMode double-mount with exactly one live Application', async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <GameCanvas scenario={scenario} />
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
