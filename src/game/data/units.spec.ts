import { describe, it, expect } from 'vitest';
import swordsmenData from './units/swordsmen.json';
import crossbowsoldierData from './units/crossbowsoldier.json';
import knightData from './units/knight.json';

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
