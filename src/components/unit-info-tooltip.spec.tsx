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
});
