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

    it('should return true when float rounding leaves a hair above 0', () => {
      // Exactly the shape a fixed-timestep cooldown hits: 0.5s stepped down
      // 30 times by 1/60 lands on ~5.6e-17, not 0. Without the epsilon the
      // timer reports "not yet" and fires a whole tick late.
      const timer = new Timer({ delay: 0.5 });
      GameTime.delta = 1 / 60;
      for (let i = 0; i < 30; i++) {
        timer.update();
      }

      expect(timer.countdown).toBeGreaterThan(0);
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
