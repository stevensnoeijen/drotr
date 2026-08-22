import { describe, expect, it } from 'vitest';

import type { Health, Renderable } from '~/game/ecs/types';
import {
  HEALTH_BAR_WIDTH,
  healthBarColor,
  healthBarFillWidth,
  markDirtyOnHealthChange,
} from './health-bar';

function makeEntity(current: number, max: number): { renderable: Renderable; health: Health } {
  return {
    renderable: { shape: 'circle', color: 0xffffff, size: 4 },
    health: { current, max },
  };
}

describe('markDirtyOnHealthChange', () => {
  it('sets renderable.dirty when health.current has changed since the last check', () => {
    const entity = makeEntity(10, 10);
    const cache = new Map<typeof entity, number>();

    // First check always mismatches (nothing cached yet); clear it to isolate
    // the actual change we're testing below.
    markDirtyOnHealthChange(entity, cache);
    entity.renderable.dirty = false;

    entity.health.current = 5;
    markDirtyOnHealthChange(entity, cache);
    expect(entity.renderable.dirty).toBe(true);
  });

  it('does not set dirty when health.current is unchanged', () => {
    const entity = makeEntity(10, 10);
    const cache = new Map<typeof entity, number>();

    markDirtyOnHealthChange(entity, cache);
    entity.renderable.dirty = false;

    markDirtyOnHealthChange(entity, cache);
    expect(entity.renderable.dirty).toBe(false);
  });
});

describe('healthBarFillWidth', () => {
  it('is 0 at zero HP', () => {
    expect(healthBarFillWidth(0, 10)).toBe(0);
  });

  it('is the full bar width at full HP', () => {
    expect(healthBarFillWidth(10, 10)).toBe(HEALTH_BAR_WIDTH);
  });

  it('scales linearly with the HP fraction', () => {
    expect(healthBarFillWidth(5, 10)).toBeCloseTo(HEALTH_BAR_WIDTH / 2);
  });

  it('clamps to the bar width when current exceeds max', () => {
    expect(healthBarFillWidth(15, 10)).toBe(HEALTH_BAR_WIDTH);
  });

  it('clamps to 0 for a negative current', () => {
    expect(healthBarFillWidth(-5, 10)).toBe(0);
  });
});

describe('healthBarColor', () => {
  it('is green above the green threshold', () => {
    expect(healthBarColor(1)).toBe(0x4caf50);
    expect(healthBarColor(0.61)).toBe(0x4caf50);
  });

  it('is yellow at and below the green threshold but above the yellow threshold', () => {
    expect(healthBarColor(0.6)).toBe(0xffca28);
    expect(healthBarColor(0.31)).toBe(0xffca28);
  });

  it('is red at and below the yellow threshold', () => {
    expect(healthBarColor(0.3)).toBe(0xf44336);
    expect(healthBarColor(0)).toBe(0xf44336);
  });
});
