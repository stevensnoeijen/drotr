import { describe, it, expect } from 'vitest';
import swordsmenData from './units/swordsmen.json';
import crossbowsoldierData from './units/crossbowsoldier.json';
import knightData from './units/knight.json';
import { footprintOf, roundUpToHalfTiles, unitSizeInTiles, units } from './units';

describe('Unit definitions', () => {
  it('swordsmen JSON has complete, non-zero combat stats', () => {
    const unit = swordsmenData as typeof swordsmenData & {
      attackDamage?: number;
      attackCooldown?: number;
      accuracy?: number;
      defence?: number;
      stamina?: number;
      speed?: number;
      movementSpeed?: number;
      range?: number;
    };

    expect(unit.attackDamage).toBeDefined();
    expect(unit.attackDamage).toBeGreaterThan(0);
    expect(unit.attackCooldown).toBeDefined();
    expect(unit.attackCooldown).toBeGreaterThan(0);
    expect(unit.accuracy).toBeDefined();
    expect(unit.accuracy).toBeGreaterThanOrEqual(0);
    expect(unit.defence).toBeDefined();
    expect(unit.defence).toBeGreaterThan(0);
    expect(unit.stamina).toBeDefined();
    expect(unit.stamina).toBeGreaterThan(0);
    expect(unit.speed).toBeDefined();
    expect(unit.speed).toBeGreaterThan(0);
    expect(unit.movementSpeed).toBeDefined();
    expect(unit.movementSpeed).toBeGreaterThan(0);
    expect(unit.range).toBeDefined();
    expect(unit.range).toBeGreaterThan(0);
  });

  it('crossbowsoldier JSON has complete, non-zero combat stats', () => {
    const unit = crossbowsoldierData as typeof crossbowsoldierData & {
      attackDamage?: number;
      attackCooldown?: number;
      accuracy?: number;
      defence?: number;
      stamina?: number;
      speed?: number;
      movementSpeed?: number;
      range?: number;
    };

    expect(unit.attackDamage).toBeDefined();
    expect(unit.attackDamage).toBeGreaterThan(0);
    expect(unit.attackCooldown).toBeDefined();
    expect(unit.attackCooldown).toBeGreaterThan(0);
    expect(unit.accuracy).toBeDefined();
    expect(unit.accuracy).toBeGreaterThanOrEqual(0);
    expect(unit.defence).toBeDefined();
    expect(unit.defence).toBeGreaterThan(0);
    expect(unit.stamina).toBeDefined();
    expect(unit.stamina).toBeGreaterThan(0);
    expect(unit.speed).toBeDefined();
    expect(unit.speed).toBeGreaterThan(0);
    expect(unit.movementSpeed).toBeDefined();
    expect(unit.movementSpeed).toBeGreaterThan(0);
    expect(unit.range).toBeDefined();
    expect(unit.range).toBeGreaterThan(0);
  });

  it('knight JSON has complete, non-zero combat stats', () => {
    const unit = knightData as typeof knightData & {
      attackDamage?: number;
      attackCooldown?: number;
      accuracy?: number;
      defence?: number;
      stamina?: number;
      speed?: number;
      movementSpeed?: number;
      range?: number;
    };

    expect(unit.attackDamage).toBeDefined();
    expect(unit.attackDamage).toBeGreaterThan(0);
    expect(unit.attackCooldown).toBeDefined();
    expect(unit.attackCooldown).toBeGreaterThan(0);
    expect(unit.accuracy).toBeDefined();
    expect(unit.accuracy).toBeGreaterThanOrEqual(0);
    expect(unit.defence).toBeDefined();
    expect(unit.defence).toBeGreaterThan(0);
    expect(unit.stamina).toBeDefined();
    expect(unit.stamina).toBeGreaterThan(0);
    expect(unit.speed).toBeDefined();
    expect(unit.speed).toBeGreaterThan(0);
    expect(unit.movementSpeed).toBeDefined();
    expect(unit.movementSpeed).toBeGreaterThan(0);
    expect(unit.range).toBeDefined();
    expect(unit.range).toBeGreaterThan(0);
  });
});

describe('roundUpToHalfTiles', () => {
  it('keeps whole half-tiles as they are', () => {
    expect(roundUpToHalfTiles(0.5)).toBe(0.5);
    expect(roundUpToHalfTiles(1)).toBe(1);
    expect(roundUpToHalfTiles(1.5)).toBe(1.5);
  });

  it('rounds anything in between up to the next half-tile', () => {
    // The measured idle sprite extents on 40px tiles: swordsmen 17x19,
    // crossbowsoldier 15x17, knight 35x37.
    expect(roundUpToHalfTiles(19 / 40)).toBe(0.5);
    expect(roundUpToHalfTiles(17 / 40)).toBe(0.5);
    expect(roundUpToHalfTiles(37 / 40)).toBe(1);
    expect(roundUpToHalfTiles(0.51)).toBe(1);
  });

  it('never rounds a unit below one half-tile', () => {
    expect(roundUpToHalfTiles(0.1)).toBe(0.5);
    expect(roundUpToHalfTiles(0)).toBe(0.5);
  });

  it('is not tipped over a half-tile by float noise', () => {
    expect(roundUpToHalfTiles(0.1 + 0.2 + 0.2)).toBe(0.5);
  });
});

describe('unitSizeInTiles', () => {
  it.each([
    ['swordsmen', 0.5],
    ['crossbowsoldier', 0.5],
    ['knight', 1],
    ['juggernaut', 1.5],
    ['catapult', 1.5],
    ['cannon', 1],
  ] as const)('sizes a %s at %s x %s tiles', (type, tiles) => {
    expect(unitSizeInTiles(units[type])).toEqual({ width: tiles, height: tiles });
  });

  it('rounds each axis up independently', () => {
    expect(unitSizeInTiles({ size: { width: 0.4, height: 0.9 } })).toEqual({
      width: 0.5,
      height: 1,
    });
  });
});

describe('footprintOf', () => {
  it('defaults to a single cell for a definition with no footprint', () => {
    expect(footprintOf({})).toEqual({ width: 1, height: 1 });
    expect(footprintOf(units.swordsmen)).toEqual({ width: 1, height: 1 });
    expect(footprintOf(units.crossbowsoldier)).toEqual({ width: 1, height: 1 });
  });

  it('gives the knight its authored 2x2 block', () => {
    expect(footprintOf(units.knight)).toEqual({ width: 2, height: 2 });
  });
});
