import { describe, expect, it, vi } from 'vitest';

import { Value } from '../../values/Value';
import { State } from '../Node';

import { GameTime } from '~/lib/GameTime';

import { Always } from './Always';
import { Timer } from './Timer';

describe('Timer', () => {
  const success = new Always(State.SUCCESS);
  const successProps = {
    delay: Value.static(1000),
    execute: success,
  };

  describe('constructor', () => {
    it('should set values', () => {
      const elapsedCallback = () => {};
      const timer = new Timer({
        ...successProps,
        onElapsed: elapsedCallback,
      });

      expect(timer.deltaTimer.delay).toBe(1000);
      expect(timer.deltaTimer.countdown).toBe(1000);
      expect(timer.deltaTimer.onElapsed).toEqual(elapsedCallback);
      expect(timer.children).toHaveLength(1);
    });

    it('should set defaults', () => {
      const timer = new Timer({
        delay: Value.static(1000),
        execute: success,
      });

      expect(timer.deltaTimer.delay).toBe(1000);
      expect(timer.deltaTimer.countdown).toBe(1000);
      expect(timer.deltaTimer.onElapsed).toBeNull();
    });
  });

  describe('evaluate', () => {
    it('should be running and time subtracted when called', () => {
      const timer = new Timer({
        ...successProps,
      });
      GameTime.delta = 100;

      expect(timer.evaluate()).toBe(State.RUNNING);
      expect(timer.deltaTimer.countdown).toEqual(900);
    });

    it('should evaluate first child when time is elapsed', () => {
      const timer = new Timer({
        ...successProps,
      });
      GameTime.delta = 1000;

      expect(timer.evaluate()).toEqual(State.SUCCESS);
    });

    it('should call endedCallback when time is elapsed', () => {
      const elapsedCallback = vi.fn();
      const timer = new Timer({
        ...successProps,
        onElapsed: elapsedCallback,
      });
      GameTime.delta = 1000;

      timer.evaluate();

      expect(elapsedCallback).toHaveBeenCalled();
    });

    it("should set deltaTimer's countdown when evalated", () => {
      const timer = new Timer(successProps);
      GameTime.delta = 900;

      timer.evaluate();

      expect(timer.deltaTimer.countdown).toEqual(100);
    });

    it('should set reset deltaTimer when delay is elapsed', () => {
      const timer = new Timer(successProps);
      GameTime.delta = 1100;
      timer.evaluate();

      expect(timer.deltaTimer.countdown).toEqual(900);
    });
  });
});
