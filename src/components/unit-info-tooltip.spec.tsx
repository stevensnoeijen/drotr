import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import UnitInfoTooltip from './unit-info-tooltip';

describe('UnitInfoTooltip', () => {
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

  it('renders nothing without stats or a pointer position', () => {
    act(() => {
      root.render(<UnitInfoTooltip />);
    });

    expect(container.textContent).toBe('');
  });

  it('shows "none" for a hovered unit with no target', () => {
    act(() => {
      root.render(
        <UnitInfoTooltip
          stats={{ id: 1, type: 'swordsmen', team: 'blue' }}
          pointerPosition={{ x: 10, y: 20 }}
        />
      );
    });

    expect(container.textContent).toContain('none');
  });

  it("shows a hovered unit's target", () => {
    act(() => {
      root.render(
        <UnitInfoTooltip
          stats={{
            id: 1,
            type: 'swordsmen',
            team: 'blue',
            target: { id: 2, type: 'crossbowsoldier' },
          }}
          pointerPosition={{ x: 10, y: 20 }}
        />
      );
    });

    expect(container.textContent).toContain('crossbowsoldier #2');
  });

  it('shows "-" for a unit with no claimed cell', () => {
    act(() => {
      root.render(
        <UnitInfoTooltip
          stats={{ id: 1, type: 'swordsmen', team: 'blue' }}
          pointerPosition={{ x: 10, y: 20 }}
        />
      );
    });

    expect(container.textContent).toContain('Cell');
    expect(container.textContent).toContain('-');
  });

  it('shows a stationary unit\'s cell alone', () => {
    act(() => {
      root.render(
        <UnitInfoTooltip
          stats={{ id: 1, type: 'swordsmen', team: 'blue', cell: { x: 3, y: 9 } }}
          pointerPosition={{ x: 10, y: 20 }}
        />
      );
    });

    expect(container.textContent).toContain('3,9');
    expect(container.textContent).not.toContain('->');
  });

  it('shows a moving unit\'s origin and destination cell', () => {
    act(() => {
      root.render(
        <UnitInfoTooltip
          stats={{
            id: 1,
            type: 'swordsmen',
            team: 'blue',
            cell: { x: 3, y: 9 },
            movingTo: { x: 4, y: 9 },
          }}
          pointerPosition={{ x: 10, y: 20 }}
        />
      );
    });

    expect(container.textContent).toContain('3,9 -> 4,9');
  });
});
