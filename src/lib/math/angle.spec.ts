import { describe, expect, it } from 'vitest';

import { quantizeAngle } from './angle';

describe('quantizeAngle', () => {
  it('leaves an angle already on a 45° step unchanged', () => {
    expect(quantizeAngle(0)).toBeCloseTo(0);
    expect(quantizeAngle(Math.PI / 4)).toBeCloseTo(Math.PI / 4);
    expect(quantizeAngle(Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(quantizeAngle(Math.PI)).toBeCloseTo(Math.PI);
  });

  it('snaps to the nearest of the 8 compass directions', () => {
    // Just inside the 0°..45° arc, closer to 0°.
    expect(quantizeAngle(0.1)).toBeCloseTo(0);
    // Just past the midpoint of 0°..45°, closer to 45°.
    expect(quantizeAngle(Math.PI / 4 + 0.1)).toBeCloseTo(Math.PI / 2 - Math.PI / 4);
  });

  it('rounds a shallow angle up to the nearest 45° step', () => {
    // atan2(1, 10) is a shallow ~5.7° angle — nowhere near a diagonal — and
    // must still snap onto the grid of 8 directions rather than passing
    // through unchanged, which is exactly the #178 bug.
    const shallow = Math.atan2(1, 10);
    expect(quantizeAngle(shallow)).toBeCloseTo(0);
  });

  it('supports a custom division count', () => {
    // 4 divisions -> 90° steps.
    expect(quantizeAngle(0.2, 4)).toBeCloseTo(0);
    expect(quantizeAngle(Math.PI / 2 + 0.2, 4)).toBeCloseTo(Math.PI / 2);
  });
});
