import { describe, expect, it } from 'vitest';

import { State } from '../Node';

import { Always } from './Always';
import { Sequence } from './Sequence';

describe('Sequence', () => {
  describe('evaluate', () => {
    it('should return success when there are 0 children', () => {
      const sequence = new Sequence([]);

      expect(sequence.evaluate()).toEqual(State.SUCCESS);
    });

    it('should return failure when any child is failure', () => {
      const sequence = new Sequence([
        new Always(State.RUNNING),
        new Always(State.FAILURE),
        new Always(State.SUCCESS),
      ]);

      expect(sequence.evaluate()).toEqual(State.FAILURE);
    });

    it('should return running when any child is running', () => {
      const sequence = new Sequence([
        new Always(State.SUCCESS),
        new Always(State.RUNNING),
      ]);

      expect(sequence.evaluate()).toEqual(State.RUNNING);
    });

    it('should return success when there all children are success', () => {
      const sequence = new Sequence([
        new Always(State.SUCCESS),
        new Always(State.SUCCESS),
      ]);

      expect(sequence.evaluate()).toEqual(State.SUCCESS);
    });
  });
});
