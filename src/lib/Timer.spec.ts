import { describe, expect, it } from 'vitest';

import { GameTime } from './GameTime';
import { Timer } from './Timer';

describe('Timer', () => {
  const successProps = {
    delay: 1000,
  };

  describe('isElapsed', () => {
    it('should return false if time is higher than 0', () => {
      const timer = new Timer({
        ...successProps,
      });

      expect(timer.isElapsed()).toBe(false);
    });

    it('should return true if time is 0', () => {
      const timer = new Timer({
        ...successProps,
      });
      GameTime.delta = 1000;
      timer.update();

      expect(timer.isElapsed()).toBe(true);
    });

    it('should return true if time is lower than 0', () => {
      const timer = new Timer({
        ...successProps,
      });
      GameTime.delta = 1100;
      timer.update();

      expect(timer.isElapsed()).toBe(true);
    });
  });

  describe('reset', () => {
    it('should set countdown to initial value', () => {
      const timer = new Timer({
        ...successProps,
      });

      timer.restart();

      expect(timer.countdown).toBe(successProps.delay);
    });

    it(`should set countdown to
      initial value - expiredTime when existing`, () => {
      const timer = new Timer({
        ...successProps,
      });
      GameTime.delta = 1100;
      timer.update();

      timer.restart();

      expect(timer.countdown).toBe(900);
    });
  });
});
