import { describe, expect, it } from 'vitest';

import { State } from '../Node';

import { Selector } from './Selector';
import { Always } from './Always';

describe('Selector', () => {
  describe('evaluate', () => {
    it('should fail when no children are set', () => {
      const selector = new Selector([]);

      expect(selector.evaluate()).toEqual(State.SUCCESS);
    });

    it('should fail when all children fail', () => {
      const selector = new Selector([
        new Always(State.FAILURE),
        new Always(State.FAILURE),
        new Always(State.FAILURE),
      ]);

      expect(selector.evaluate()).toEqual(State.FAILURE);
    });

    it('should return success when one of the children returned success', () => {
      const selector = new Selector([
        new Always(State.FAILURE),
        new Always(State.SUCCESS),
      ]);

      expect(selector.evaluate()).toEqual(State.SUCCESS);
    });

    it('should return running when one of the children returned running', () => {
      const selector = new Selector([
        new Always(State.FAILURE),
        new Always(State.RUNNING),
      ]);

      expect(selector.evaluate()).toEqual(State.RUNNING);
    });

    it('should return success when there are also running children', () => {
      const selector = new Selector([
        new Always(State.RUNNING),
        new Always(State.SUCCESS),
      ]);

      expect(selector.evaluate()).toEqual(State.SUCCESS);
    });
  });
});
