import { describe, expect, it } from 'vitest';

import {
  ARC_PEAK_HEIGHT_FACTOR,
  arcOffset,
  flightProgress,
  isArcingProjectile,
} from './projectile-arc';

describe('arcOffset', () => {
  it('is 0 at launch and at the target', () => {
    expect(arcOffset(0, 200)).toBe(0);
    expect(arcOffset(1, 200)).toBe(0);
  });

  it('peaks at the midpoint, at the peak height factor times the distance', () => {
    expect(arcOffset(0.5, 200)).toBeCloseTo(200 * ARC_PEAK_HEIGHT_FACTOR);
    for (const progress of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
      expect(arcOffset(progress, 200)).toBeLessThan(arcOffset(0.5, 200));
    }
  });

  it('is symmetric about the midpoint', () => {
    expect(arcOffset(0.2, 200)).toBeCloseTo(arcOffset(0.8, 200));
  });

  it('scales with the launch distance', () => {
    expect(arcOffset(0.5, 400)).toBeCloseTo(2 * arcOffset(0.5, 200));
  });

  it('stays on the ground outside the flight', () => {
    expect(arcOffset(-0.5, 200)).toBe(0);
    expect(arcOffset(1.5, 200)).toBe(0);
  });
});

describe('flightProgress', () => {
  it('runs from 0 at launch to 1 at the launch distance', () => {
    expect(flightProgress(0, 100)).toBe(0);
    expect(flightProgress(25, 100)).toBe(0.25);
    expect(flightProgress(100, 100)).toBe(1);
  });

  it('clamps an overshooting homing projectile to 1', () => {
    expect(flightProgress(130, 100)).toBe(1);
  });

  it('counts a zero-length shot as landed', () => {
    expect(flightProgress(0, 0)).toBe(1);
  });
});

describe('isArcingProjectile', () => {
  it('arcs the rock but never the bolt', () => {
    expect(isArcingProjectile('rock')).toBe(true);
    expect(isArcingProjectile('bolt')).toBe(false);
  });
});
