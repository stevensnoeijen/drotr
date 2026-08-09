import type { World } from 'miniplex';

import type { Entity } from './types';

/**
 * A system is a pure step over the world: given the world and the fixed
 * timestep `dt` (in seconds), it mutates ECS components. Systems must not touch
 * Pixi or any view state — the simulation stays headless.
 */
export type System = (world: World<Entity>, dt: number) => void;

/**
 * Runs a fixed, ordered list of systems. Order matters (perception before
 * movement before combat, etc.), so it is fixed at construction and preserved
 * on {@link SystemRunner.run}.
 */
export class SystemRunner {
  private readonly systems: System[];

  constructor(systems: System[] = []) {
    this.systems = [...systems];
  }

  /** Appends a system to the end of the run order. */
  public add(system: System): this {
    this.systems.push(system);
    return this;
  }

  /** The systems in the order they will run. */
  public get order(): readonly System[] {
    return this.systems;
  }

  /** Runs every system once, in order, for a single fixed step. */
  public run(world: World<Entity>, dt: number): void {
    for (const system of this.systems) {
      system(world, dt);
    }
  }
}
