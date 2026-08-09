import { describe, expect, it } from 'vitest';

import { State } from '../Node';

import { Always } from './Always';

describe('Always', () => {
  describe('evaluate', () => {
    it.each([[State.FAILURE], [State.RUNNING], [State.SUCCESS]])(
      'should return %s when set',
      (state) => {
        const always = new Always(state);

        expect(always.evaluate()).toEqual(state);
      }
    );
  });
});
