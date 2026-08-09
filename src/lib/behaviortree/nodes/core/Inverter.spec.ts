import { describe, expect, it } from 'vitest';

import { State } from '../Node';

import { Always } from './Always';
import { Inverter } from './Inverter';

describe('Inverter', () => {
  describe('evaluate', () => {
    it('should return failure when child has no state', () => {
      const inventer = new Inverter(
        new Always(undefined as unknown as State),
      );

      expect(inventer.evaluate()).toEqual(State.FAILURE);
    });

    it.each([
      [State.FAILURE, State.SUCCESS],
      [State.SUCCESS, State.FAILURE],
      [State.RUNNING, State.RUNNING],
    ])('should return %s when %s is given', (childState, returnValue) => {
      const inventer = new Inverter(new Always(childState));

      expect(inventer.evaluate()).toEqual(returnValue);
    });
  });
});
