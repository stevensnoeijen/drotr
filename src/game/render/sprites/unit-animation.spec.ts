import { describe, expect, it } from 'vitest';

import { DIRECTIONS } from './animation-key';
import { animationKeyOf, directionOf, unitActionOf } from './unit-animation';

const STEP = Math.PI / 4;
const TAU = Math.PI * 2;

describe('directionOf', () => {
  it.each(DIRECTIONS.map((d, i) => [d, i * STEP] as const))(
    'maps quantized angle for %s',
    (direction, angle) => {
      expect(directionOf(angle)).toBe(direction);
    }
  );

  it('normalises negative angles', () => {
    expect(directionOf(-STEP)).toBe('nw');
    expect(directionOf(-Math.PI / 2)).toBe('w');
    expect(directionOf(-Math.PI)).toBe('s');
  });

  it('normalises angles beyond a full turn', () => {
    expect(directionOf(TAU)).toBe('n');
    expect(directionOf(TAU + STEP)).toBe('ne');
    expect(directionOf(3 * TAU + Math.PI)).toBe('s');
    expect(directionOf(-3 * TAU - STEP * 3)).toBe('sw');
  });

  it.each(DIRECTIONS.map((d, i) => [d, i * STEP] as const))(
    'tolerates float noise around %s',
    (direction, angle) => {
      for (const noise of [1e-9, -1e-9, 1e-6, -1e-6, 0.1, -0.1]) {
        expect(directionOf(angle + noise)).toBe(direction);
      }
      expect(directionOf(angle + TAU + 1e-9)).toBe(direction);
      expect(directionOf(angle - TAU - 1e-9)).toBe(direction);
    }
  );

  it('switches sector at the 22.5 degree boundary', () => {
    expect(directionOf(STEP / 2 - 1e-6)).toBe('n');
    expect(directionOf(STEP / 2 + 1e-6)).toBe('ne');
  });
});

describe('unitActionOf', () => {
  const still = { x: 0, y: 0 };
  const moving = { x: 1, y: 0 };

  it('is idle with no velocity, zero velocity, and no swing', () => {
    expect(unitActionOf({})).toBe('idle');
    expect(unitActionOf({ velocity: still })).toBe('idle');
  });

  it('is move with non-zero velocity on either axis', () => {
    expect(unitActionOf({ velocity: moving })).toBe('move');
    expect(unitActionOf({ velocity: { x: 0, y: -0.5 } })).toBe('move');
  });

  it('is attack while swinging, even when stationary', () => {
    expect(unitActionOf({ attackSwing: { elapsed: 0 }, velocity: still })).toBe('attack');
    expect(unitActionOf({ attackSwing: { elapsed: 0.2 } })).toBe('attack');
  });

  it('prefers attack over move', () => {
    expect(unitActionOf({ attackSwing: { elapsed: 0 }, velocity: moving })).toBe('attack');
  });

  it('prefers dead over everything', () => {
    expect(unitActionOf({ dead: { elapsed: 0 } })).toBe('dead');
    expect(
      unitActionOf({ dead: { elapsed: 0 }, attackSwing: { elapsed: 0 }, velocity: moving })
    ).toBe('dead');
  });
});

describe('animationKeyOf', () => {
  const transform = (rotation: number) => ({ position: { x: 0, y: 0 }, rotation });

  it('combines unit type, team, action and facing', () => {
    expect(
      animationKeyOf({
        unitType: 'swordsmen',
        team: 'red',
        transform: transform(-STEP),
        velocity: { x: 1, y: 1 },
      })
    ).toBe('swordsmen.red.move.nw');
  });

  it('reflects a dead unit that keeps its last facing', () => {
    expect(
      animationKeyOf({
        unitType: 'knight',
        team: 'blue',
        transform: transform(Math.PI),
        dead: { elapsed: 1 },
      })
    ).toBe('knight.blue.dead.s');
  });

  it('uses the neutral set for a unit without a team', () => {
    expect(animationKeyOf({ unitType: 'crossbowsoldier', transform: transform(0) })).toBe(
      'crossbowsoldier.neutral.idle.n'
    );
  });

  it('is undefined without a unit type or a transform', () => {
    expect(animationKeyOf({ team: 'red', transform: transform(0) })).toBeUndefined();
    expect(animationKeyOf({ unitType: 'knight', team: 'red' })).toBeUndefined();
  });
});
