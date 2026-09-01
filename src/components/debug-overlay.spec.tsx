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
      ['grid', 'health', 'unit-info', 'targets', 'paths']
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

  it('shows "none" for a selected unit with no target', () => {
    act(() => {
      root.render(
        <DebugOverlay
          stats={{
            ...STATS,
            selectedUnitStats: { id: 1, type: 'swordsmen', team: 'blue' },
          }}
          debugFlags={new Set()}
          onToggleDebugFlag={() => {}}
        />
      );
    });

    expect(container.textContent).toContain('none');
  });

  it("shows a selected unit's target", () => {
    act(() => {
      root.render(
        <DebugOverlay
          stats={{
            ...STATS,
            selectedUnitStats: {
              id: 1,
              type: 'swordsmen',
              team: 'blue',
              target: { id: 2, type: 'crossbowsoldier' },
            },
          }}
          debugFlags={new Set()}
          onToggleDebugFlag={() => {}}
        />
      );
    });

    expect(container.textContent).toContain('crossbowsoldier #2');
  });
});
