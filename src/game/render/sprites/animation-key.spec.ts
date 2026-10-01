import { describe, expect, it } from 'vitest';
import {
  ANIMATION_TEAMS,
  DIRECTIONS,
  UNIT_ACTIONS,
  UNIT_TYPES,
  animationKey,
  frameName,
  parseAnimationKey,
} from './animation-key';

describe('animation key', () => {
  it('builds the documented example', () => {
    const key = animationKey('swordsmen', 'red', 'move', 'nw');
    expect(key).toBe('swordsmen.red.move.nw');
    expect(frameName(key, 1)).toBe('swordsmen.red.move.nw_01');
    expect(frameName(key, 12)).toBe('swordsmen.red.move.nw_12');
  });

  it('round-trips every unit x team x action x direction', () => {
    for (const unit of UNIT_TYPES)
      for (const team of ANIMATION_TEAMS)
        for (const action of UNIT_ACTIONS)
          for (const direction of DIRECTIONS) {
            const key = animationKey(unit, team, action, direction);
            expect(parseAnimationKey(key)).toEqual({
              unit,
              team,
              action,
              direction,
            });
          }
  });

  it('rejects malformed keys', () => {
    for (const bad of [
      '',
      'swordsmen.red.move',
      'swordsmen.red.move.nw.x',
      'orc.red.move.nw',
      'swordsmen.green.move.nw',
      'swordsmen.red.fly.nw',
      'swordsmen.red.move.up',
      'swordsmen.red.move.nw_01',
    ]) {
      expect(parseAnimationKey(bad)).toBeUndefined();
    }
  });
});
