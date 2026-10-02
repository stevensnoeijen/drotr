import { describe, expect, it } from 'vitest';

import { animationSpeed, isSpriteUnitType, SPRITE_UNIT_TYPES } from './unit-sprites';

describe('SPRITE_UNIT_TYPES', () => {
  it('renders swordsmen and crossbow soldiers as sprites', () => {
    expect(SPRITE_UNIT_TYPES).toEqual(['swordsmen', 'crossbowsoldier']);
  });

  it('is what isSpriteUnitType decides by', () => {
    expect(isSpriteUnitType('swordsmen')).toBe(true);
    expect(isSpriteUnitType('knight')).toBe(false);
    expect(isSpriteUnitType('crossbowsoldier')).toBe(true);
    expect(isSpriteUnitType(undefined)).toBe(false);
  });
});

describe('animationSpeed', () => {
  it('converts manifest fps to a speed on the 60 Hz ticker', () => {
    expect(animationSpeed(15)).toBe(0.25);
    expect(animationSpeed(0)).toBe(0);
  });
});
