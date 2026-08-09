import { World } from 'miniplex';
import { describe, expect, it, vi } from 'vitest';

import { SystemRunner, type System } from './System';
import type { Entity } from './types';

describe('SystemRunner', () => {
  it('runs systems in the order they were provided', () => {
    const calls: string[] = [];
    const a: System = () => calls.push('a');
    const b: System = () => calls.push('b');
    const c: System = () => calls.push('c');

    const runner = new SystemRunner([a, b, c]);
    runner.run(new World<Entity>(), 1 / 60);

    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('appends systems with add(), preserving order', () => {
    const calls: string[] = [];
    const runner = new SystemRunner([() => calls.push('first')]);
    runner.add(() => calls.push('second'));

    runner.run(new World<Entity>(), 1 / 60);

    expect(calls).toEqual(['first', 'second']);
    expect(runner.order).toHaveLength(2);
  });

  it('passes the world and dt through to each system', () => {
    const world = new World<Entity>();
    const system = vi.fn();

    new SystemRunner([system]).run(world, 0.5);

    expect(system).toHaveBeenCalledWith(world, 0.5);
  });

  it('does nothing when there are no systems', () => {
    const runner = new SystemRunner();
    expect(() => runner.run(new World<Entity>(), 1 / 60)).not.toThrow();
    expect(runner.order).toHaveLength(0);
  });
});
