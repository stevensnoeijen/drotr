import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GameCanvas from './game-canvas';
import { loadUnitSprites } from '~/game/render/sprites/load-unit-sprites';
import type { MapDefinition } from '~/game/maps';
import type { Scenario } from '~/game/scenarios';

const scenario: Scenario = {
  id: 'test',
  title: 'Test',
  description: 'Test scenario for GameCanvas specs.',
  setup: () => {},
};

const map: MapDefinition = {
  id: 'empty',
  title: 'Empty',
  description: 'Test map for GameCanvas specs.',
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
    stroke = vi.fn().mockReturnThis();
    clear = vi.fn().mockReturnThis();
    destroy = vi.fn();
  }

  class Container {
    addChild = vi.fn();
  }

  return { Application, Graphics, Container };
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

interface MockMapRenderSystem {
  container: object;
  setLayerVisibility: ReturnType<typeof vi.fn>;
  cull: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

let mapRenderSystems: MockMapRenderSystem[] = [];

// Only reached for a map with a `mapSource`; the specs above use the blank map.
vi.mock('~/game/map/load-tiled-map', () => ({
  loadTiledMap: vi.fn().mockResolvedValue({
    width: 2,
    height: 1,
    tileSize: 40,
    collision: new Uint8Array(2),
    spawns: [],
    tileset: {},
    tileLayers: [
      { name: 'terrain', visible: true, data: [1, 1] },
      { name: 'intact', visible: true, data: [0, 2] },
      { name: 'ruined', visible: false, data: [3, 0] },
    ],
    objectLayers: [{ name: 'spawns', visible: true, objects: [] }],
  }),
}));

vi.mock('~/game/render/map-render-system', () => ({
  createMapRenderSystem: vi.fn(async () => {
    const system: MockMapRenderSystem = {
      container: {},
      setLayerVisibility: vi.fn(),
      cull: vi.fn(),
      dispose: vi.fn(),
    };
    mapRenderSystems.push(system);
    return system;
  }),
}));

// No network in specs: the sprite data itself is covered by the loader's
// own spec, so here it's just whether, when and with what outcome it loads.
vi.mock('~/game/render/sprites/load-unit-sprites', () => ({
  loadUnitSprites: vi.fn(async () => new Map()),
}));

describe('GameCanvas', () => {
  beforeEach(() => {
    vi.mocked(loadUnitSprites).mockClear();
    mapRenderSystems = [];
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
      root.render(<GameCanvas scenario={scenario} map={map} />);
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
          <GameCanvas scenario={scenario} map={map} />
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

  describe('unit sprites', () => {
    it('loads them before the scenario spawns, on every mount', async () => {
      const setup = vi.fn();
      const root = createRoot(container);

      await act(async () => {
        root.render(<GameCanvas scenario={{ ...scenario, setup }} map={map} />);
      });

      expect(loadUnitSprites).toHaveBeenCalledOnce();
      expect(setup).toHaveBeenCalledOnce();
      expect(vi.mocked(loadUnitSprites).mock.invocationCallOrder[0]).toBeLessThan(
        setup.mock.invocationCallOrder[0]
      );
      act(() => root.unmount());

      // A remount (e.g. switching scenario or map and back) loads them again.
      const remounted = createRoot(container);
      await act(async () => {
        remounted.render(<GameCanvas scenario={{ ...scenario, setup }} map={map} />);
      });

      expect(loadUnitSprites).toHaveBeenCalledTimes(2);
      expect(setup).toHaveBeenCalledTimes(2);
      act(() => remounted.unmount());
    });

    it('reports a failed load through onError and spawns nothing', async () => {
      vi.mocked(loadUnitSprites).mockRejectedValueOnce(
        new Error("Couldn't load the unit atlas (/assets/units.json): 404 Not Found")
      );
      const setup = vi.fn();
      const onError = vi.fn();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const root = createRoot(container);

      await act(async () => {
        root.render(<GameCanvas scenario={{ ...scenario, setup }} map={map} onError={onError} />);
      });

      expect(onError).toHaveBeenCalledExactlyOnceWith(
        "Couldn't load the unit atlas (/assets/units.json): 404 Not Found"
      );
      expect(setup).not.toHaveBeenCalled();
      consoleError.mockRestore();
      act(() => root.unmount());
    });
  });

  describe('tile layers', () => {
    const tiledMap: MapDefinition = { ...map, id: 'tiled', mapSource: '/maps/tiled.tmj' };

    it('reports no tile layers for the blank map', async () => {
      const onTileLayers = vi.fn();
      const root = createRoot(container);

      await act(async () => {
        root.render(<GameCanvas scenario={scenario} map={map} onTileLayers={onTileLayers} />);
      });

      expect(onTileLayers).toHaveBeenCalledExactlyOnceWith([]);
      act(() => root.unmount());
    });

    it("reports the loaded map's tile layers, hidden ones included, then its object layers", async () => {
      const onTileLayers = vi.fn();
      const root = createRoot(container);

      await act(async () => {
        root.render(<GameCanvas scenario={scenario} map={tiledMap} onTileLayers={onTileLayers} />);
      });

      expect(onTileLayers).toHaveBeenCalledExactlyOnceWith([
        { name: 'terrain', visible: true, kind: 'tile' },
        { name: 'intact', visible: true, kind: 'tile' },
        { name: 'ruined', visible: false, kind: 'tile' },
        { name: 'spawns', visible: true, kind: 'object' },
      ]);
      act(() => root.unmount());
    });

    it('leaves layers as built when no visibility is given', async () => {
      const root = createRoot(container);

      await act(async () => {
        root.render(<GameCanvas scenario={scenario} map={tiledMap} />);
      });

      expect(mapRenderSystems).toHaveLength(1);
      expect(mapRenderSystems[0].setLayerVisibility).not.toHaveBeenCalled();
      act(() => root.unmount());
    });

    it('applies tileLayerVisibility in place when it changes, without remounting', async () => {
      const root = createRoot(container);

      await act(async () => {
        root.render(
          <GameCanvas scenario={scenario} map={tiledMap} tileLayerVisibility={[true, true, false]} />
        );
      });
      const [system] = mapRenderSystems;
      expect(system.setLayerVisibility).toHaveBeenLastCalledWith([true, true, false]);

      await act(async () => {
        root.render(
          <GameCanvas scenario={scenario} map={tiledMap} tileLayerVisibility={[true, false, true]} />
        );
      });

      expect(system.setLayerVisibility).toHaveBeenLastCalledWith([true, false, true]);
      expect(instances).toHaveLength(1);
      expect(mapRenderSystems).toHaveLength(1);

      act(() => root.unmount());
      expect(system.dispose).toHaveBeenCalledOnce();
    });
  });
});
