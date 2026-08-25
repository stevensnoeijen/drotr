import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import type { Health, Renderable } from '~/game/ecs/types';
import {
  HEALTH_BAR_WIDTH,
  createHealthBar,
  drawDeathMark,
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

describe('createHealthBar', () => {
  it('builds a bar as wide as the unit (unitSize * 2), centered under it', () => {
    const bar = createHealthBar(30);

    expect(bar.width).toBe(60);
    expect(bar.container.position.x).toBe(-30);
  });
});

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

describe('drawDeathMark', () => {
  it('draws nothing for a living unit', () => {
    const mark = new Graphics();
    drawDeathMark(mark, 10, false);
    expect(mark.context.instructions.length).toBe(0);
  });

  it('draws a cross for a dead unit', () => {
    const mark = new Graphics();
    drawDeathMark(mark, 10, true);
    expect(mark.context.instructions.length).toBeGreaterThan(0);
  });

  it('clears a previously drawn cross once no longer dead', () => {
    const mark = new Graphics();
    drawDeathMark(mark, 10, true);
    drawDeathMark(mark, 10, false);
    expect(mark.context.instructions.length).toBe(0);
  });
});
