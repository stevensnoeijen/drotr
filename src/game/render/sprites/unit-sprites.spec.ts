import { describe, expect, it } from 'vitest';

import { animationSpeed, isSpriteUnitType, SPRITE_UNIT_TYPES } from './unit-sprites';

describe('SPRITE_UNIT_TYPES', () => {
  it('renders only swordsmen as sprites for now', () => {
    expect(SPRITE_UNIT_TYPES).toEqual(['swordsmen']);
  });

  it('is what isSpriteUnitType decides by', () => {
    expect(isSpriteUnitType('swordsmen')).toBe(true);
    expect(isSpriteUnitType('knight')).toBe(false);
    expect(isSpriteUnitType('crossbowsoldier')).toBe(false);
    expect(isSpriteUnitType(undefined)).toBe(false);
  });
});

describe('animationSpeed', () => {
  it('converts manifest fps to a speed on the 60 Hz ticker', () => {
    expect(animationSpeed(15)).toBe(0.25);
    expect(animationSpeed(0)).toBe(0);
  });
});
