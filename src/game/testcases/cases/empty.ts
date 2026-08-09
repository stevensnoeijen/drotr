import type { TestCase } from '../types';

/**
 * The baseline case: an empty world with no units. Exercises the harness
 * itself (routing, resolution, debug overlays) independent of any spawn or
 * map content.
 */
export const emptyCase: TestCase = {
  id: 'empty',
  title: 'Empty',
  description: 'An empty world with no units. Loads no systems or entities.',
  map: 'empty',
  setup: () => {},
};
