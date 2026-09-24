import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DebugOverlay, { type GameStats } from './debug-overlay';
import type { DebugFlag } from '~/game/scenarios';

const STATS: GameStats = { fps: 60, tick: 120, entities: 4 };

describe('DebugOverlay', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders the stats readout', () => {
    act(() => {
      root.render(
        <DebugOverlay
          stats={STATS}
          debugFlags={new Set()}
          onToggleDebugFlag={() => {}}
        />
      );
    });

    expect(container.textContent).toContain('60');
    expect(container.textContent).toContain('120');
    expect(container.textContent).toContain('4');
  });

  it('opens the debug dropdown and shows every flag, checked to match debugFlags', () => {
    act(() => {
      root.render(
        <DebugOverlay
          stats={STATS}
          debugFlags={new Set(['grid'])}
          onToggleDebugFlag={() => {}}
        />
      );
    });

    act(() => {
      container
        .querySelector('button')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const checkboxes = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    );
    expect(checkboxes.map((c) => c.parentElement?.textContent?.trim())).toEqual(
      ['grid', 'health', 'unit-info', 'targets', 'paths', 'tile-layers']
    );
    const gridCheckbox = checkboxes.find(
      (c) => c.parentElement?.textContent?.trim() === 'grid'
    );
    expect(gridCheckbox?.checked).toBe(true);
    const healthCheckbox = checkboxes.find(
      (c) => c.parentElement?.textContent?.trim() === 'health'
    );
    expect(healthCheckbox?.checked).toBe(false);
    const unitInfoCheckbox = checkboxes.find(
      (c) => c.parentElement?.textContent?.trim() === 'unit-info'
    );
    expect(unitInfoCheckbox?.checked).toBe(false);
  });

  it('calls onToggleDebugFlag with the clicked flag', () => {
    const onToggleDebugFlag = vi.fn<(flag: DebugFlag) => void>();

    act(() => {
      root.render(
        <DebugOverlay
          stats={STATS}
          debugFlags={new Set()}
          onToggleDebugFlag={onToggleDebugFlag}
        />
      );
    });

    act(() => {
      container
        .querySelector('button')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const gridCheckbox = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    ).find((c) => c.parentElement?.textContent?.trim() === 'grid');

    act(() => {
      gridCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggleDebugFlag).toHaveBeenCalledWith('grid');
  });

  describe('tile-layers', () => {
    const LAYERS = [
      { name: 'terrain', visible: true },
      { name: 'intact', visible: true },
      { name: 'ruined', visible: false },
    ];

    function openMenu() {
      act(() => {
        container
          .querySelector('button')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }

    /** The per-layer checkboxes, as `[name, checked]`, or `undefined` if not listed. */
    function listedLayers(): [string, boolean][] | undefined {
      const list = container.querySelector('ul[aria-label="Tile layers"]');
      if (!list) {
        return undefined;
      }
      return Array.from(list.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).map(
        (c) => [c.parentElement?.textContent?.trim() ?? '', c.checked]
      );
    }

    it('lists no layers while the option is off', () => {
      act(() => {
        root.render(
          <DebugOverlay
            stats={STATS}
            debugFlags={new Set()}
            onToggleDebugFlag={() => {}}
            tileLayers={LAYERS}
            tileLayerVisibility={[true, true, false]}
          />
        );
      });
      openMenu();

      expect(listedLayers()).toBeUndefined();
    });

    it('lists every layer underneath the option while it is on, checked to match their visibility', () => {
      act(() => {
        root.render(
          <DebugOverlay
            stats={STATS}
            debugFlags={new Set(['tile-layers'])}
            onToggleDebugFlag={() => {}}
            tileLayers={LAYERS}
            tileLayerVisibility={[true, false, true]}
          />
        );
      });
      openMenu();

      expect(listedLayers()).toEqual([
        ['terrain', true],
        ['intact', false],
        ['ruined', true],
      ]);
      // Nested inside the option's own entry.
      const list = container.querySelector('ul[aria-label="Tile layers"]');
      expect(list?.parentElement?.querySelector('label')?.textContent?.trim()).toBe('tile-layers');
    });

    it("falls back to the layers' own visibility without a visibility prop", () => {
      act(() => {
        root.render(
          <DebugOverlay
            stats={STATS}
            debugFlags={new Set(['tile-layers'])}
            onToggleDebugFlag={() => {}}
            tileLayers={LAYERS}
          />
        );
      });
      openMenu();

      expect(listedLayers()).toEqual([
        ['terrain', true],
        ['intact', true],
        ['ruined', false],
      ]);
    });

    it('calls onToggleTileLayer with the clicked layer index', () => {
      const onToggleTileLayer = vi.fn<(index: number) => void>();
      act(() => {
        root.render(
          <DebugOverlay
            stats={STATS}
            debugFlags={new Set(['tile-layers'])}
            onToggleDebugFlag={() => {}}
            tileLayers={LAYERS}
            tileLayerVisibility={[true, true, false]}
            onToggleTileLayer={onToggleTileLayer}
          />
        );
      });
      openMenu();

      const ruined = Array.from(
        container.querySelectorAll<HTMLInputElement>('ul[aria-label="Tile layers"] input')
      ).find((c) => c.parentElement?.textContent?.trim() === 'ruined');
      act(() => {
        ruined?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(onToggleTileLayer).toHaveBeenCalledExactlyOnceWith(2);
    });

    it('says so when the map has no tile layers', () => {
      act(() => {
        root.render(
          <DebugOverlay
            stats={STATS}
            debugFlags={new Set(['tile-layers'])}
            onToggleDebugFlag={() => {}}
          />
        );
      });
      openMenu();

      expect(listedLayers()).toEqual([]);
      expect(container.textContent).toContain('no tile layers');
    });
  });
});
