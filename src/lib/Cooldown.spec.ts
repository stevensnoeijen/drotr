import { describe, expect, it, vi } from 'vitest';

import { GameTime } from './GameTime';
import { Cooldown } from './Cooldown';

describe('Cooldown', () => {
  const delayTime = 1000;

  describe('update', () => {
    it('should not call onAction before delay is reached', () => {
      const onAction = vi.fn();
      const cooldown = new Cooldown(delayTime, onAction);
      GameTime.delta = 500;

      cooldown.update();

      expect(onAction).not.toHaveBeenCalled();
    });

    it('should call onAction when delay is reached', () => {
      const onAction = vi.fn();
      const cooldown = new Cooldown(delayTime, onAction);
      GameTime.delta = delayTime;

      cooldown.update();

      expect(onAction).toHaveBeenCalledOnce();
    });

    it('should restart after calling onAction', () => {
      const onAction = vi.fn();
      const cooldown = new Cooldown(delayTime, onAction);
      GameTime.delta = delayTime;

      cooldown.update();
      GameTime.delta = 500;
      cooldown.update();

      expect(onAction).toHaveBeenCalledOnce();
    });

    it('should call onAction again after second delay', () => {
      const onAction = vi.fn();
      const cooldown = new Cooldown(delayTime, onAction);
      GameTime.delta = delayTime;

      cooldown.update();
      expect(onAction).toHaveBeenCalledOnce();

      GameTime.delta = delayTime;
      cooldown.update();

      expect(onAction).toHaveBeenCalledTimes(2);
    });
  });

  describe('reset', () => {
    it('should reset the timer', () => {
      const onAction = vi.fn();
      const cooldown = new Cooldown(delayTime, onAction);
      GameTime.delta = 500;
      cooldown.update();

      cooldown.reset();
      GameTime.delta = 500;
      cooldown.update();

      expect(onAction).not.toHaveBeenCalled();
    });
  });
});
