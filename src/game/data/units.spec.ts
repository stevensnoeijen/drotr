import { describe, it, expect } from 'vitest';
import { units } from './units';
import swordsmenData from './units/swordsmen.json';
import crossbowsoldierData from './units/crossbowsoldier.json';

describe('Unit definitions', () => {
  it('swordsmen JSON has complete, non-zero combat stats', () => {
    const unit = swordsmenData as typeof swordsmenData & {
      attackDamage?: number;
      accuracy?: number;
      defence?: number;
      stamina?: number;
      speed?: number;
      range?: number;
    };

    expect(unit.attackDamage).toBeDefined();
    expect(unit.attackDamage).toBeGreaterThan(0);
    expect(unit.accuracy).toBeDefined();
    expect(unit.accuracy).toBeGreaterThanOrEqual(0);
    expect(unit.defence).toBeDefined();
    expect(unit.defence).toBeGreaterThan(0);
    expect(unit.stamina).toBeDefined();
    expect(unit.stamina).toBeGreaterThan(0);
    expect(unit.speed).toBeDefined();
    expect(unit.speed).toBeGreaterThan(0);
    expect(unit.range).toBeDefined();
    expect(unit.range).toBeGreaterThan(0);
  });

  it('crossbowsoldier JSON has complete, non-zero combat stats', () => {
    const unit = crossbowsoldierData as typeof crossbowsoldierData & {
      attackDamage?: number;
      accuracy?: number;
      defence?: number;
      stamina?: number;
      speed?: number;
      range?: number;
    };

    expect(unit.attackDamage).toBeDefined();
    expect(unit.attackDamage).toBeGreaterThan(0);
    expect(unit.accuracy).toBeDefined();
    expect(unit.accuracy).toBeGreaterThanOrEqual(0);
    expect(unit.defence).toBeDefined();
    expect(unit.defence).toBeGreaterThan(0);
    expect(unit.stamina).toBeDefined();
    expect(unit.stamina).toBeGreaterThan(0);
    expect(unit.speed).toBeDefined();
    expect(unit.speed).toBeGreaterThan(0);
    expect(unit.range).toBeDefined();
    expect(unit.range).toBeGreaterThan(0);
  });

  it('knight definition lacks combat stats (legacy inline definition)', () => {
    const unit = units.knight;

    expect(unit.attackDamage).toBeUndefined();
    expect(unit.accuracy).toBeUndefined();
    expect(unit.defence).toBeUndefined();
    expect(unit.stamina).toBeUndefined();
    expect(unit.speed).toBeUndefined();
    expect(unit.range).toBeUndefined();
  });
});
