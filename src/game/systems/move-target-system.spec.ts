import { World } from 'miniplex';
import { describe, expect, it } from 'vitest';

import { createQueries } from '~/game/ecs/world';
import type { Entity } from '~/game/ecs/entity';
import { createMoveTargetSystem } from './move-target-system';

describe('createMoveTargetSystem', () => {
  it('sets velocity toward the move target, scaled to moveSpeed', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createMoveTargetSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 10 },
      moveTarget: { position: { x: 100, y: 0 } },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 10, y: 0 });
    expect(self.moveTarget).toBeDefined();
  });

  it('points velocity diagonally toward an off-axis destination', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createMoveTargetSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 5 },
      moveTarget: { position: { x: 30, y: 40 } },
    });

    system(world, 1 / 60);

    // Distance is 50 (3-4-5 triangle), so unit vector is (0.6, 0.8).
    expect(self.velocity.x).toBeCloseTo(3);
    expect(self.velocity.y).toBeCloseTo(4);
  });

  it('advances the unit toward its target at the expected speed over a full step', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const moveTargetSystem = createMoveTargetSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 60 },
      moveTarget: { position: { x: 600, y: 0 } },
    });

    const dt = 1;
    moveTargetSystem(world, dt);
    self.transform.position.x += self.velocity.x * dt;
    self.transform.position.y += self.velocity.y * dt;

    expect(self.transform.position.x).toBeCloseTo(60);
    expect(self.moveTarget).toBeDefined();
  });

  it('clears the target and zeroes velocity once within arrival tolerance', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createMoveTargetSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 5, y: 0 },
      moveSpeed: { value: 10 },
      moveTarget: { position: { x: 0.5, y: 0 } },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 0, y: 0 });
    expect(self.moveTarget).toBeUndefined();
  });

  it('clears the target exactly on arrival (no overshoot) for a step that would otherwise pass it', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createMoveTargetSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: 100 },
      moveTarget: { position: { x: 10, y: 0 } },
    });

    const dt = 1;
    system(world, dt);
    self.transform.position.x += self.velocity.x * dt;

    expect(self.transform.position.x).toBeCloseTo(10);
  });

  it('travels speed * dt in world units per fixed step, for a given moveSpeed', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createMoveTargetSystem(queries);

    const speed = 90;
    const dt = 1 / 30;
    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 0, y: 0 },
      moveSpeed: { value: speed },
      moveTarget: { position: { x: 1000, y: 0 } },
    });

    system(world, dt);
    self.transform.position.x += self.velocity.x * dt;

    expect(self.transform.position.x).toBeCloseTo(speed * dt);
  });

  it('reaches the same position for the same total elapsed time, regardless of how dt is chunked (framerate independence)', () => {
    // Cover the same 1 second of simulated time as either 30 steps of 1/30s
    // or 20 steps of 1/20s, well short of the target so the arrival clamp
    // never kicks in — a pure integration comparison. Fixed-timestep
    // integration means the resulting position should match regardless of
    // how that one second was chunked into steps.
    function runFor(dt: number, steps: number): number {
      const world = new World<Entity>();
      const queries = createQueries(world);
      const system = createMoveTargetSystem(queries);

      const self = world.add({
        transform: { position: { x: 0, y: 0 }, rotation: 0 },
        velocity: { x: 0, y: 0 },
        moveSpeed: { value: 30 },
        moveTarget: { position: { x: 1000, y: 0 } },
      });

      for (let i = 0; i < steps; i++) {
        system(world, dt);
        self.transform.position.x += self.velocity.x * dt;
      }
      return self.transform.position.x;
    }

    const positionAt30Fps = runFor(1 / 30, 30);
    const positionAt20Fps = runFor(1 / 20, 20);

    expect(positionAt30Fps).toBeCloseTo(30);
    expect(positionAt20Fps).toBeCloseTo(30);
    expect(positionAt30Fps).toBeCloseTo(positionAt20Fps);
  });

  it('arrives in a tick count proportional to distance/speed regardless of frame pacing', () => {
    // moveSpeed and distance are chosen so each fixed step covers a whole
    // number of world units: 30 steps of 1 unit (30fps) or 20 steps of 1.5
    // units (20fps) both cover the same 30-unit trip in the same 1 second
    // of simulated time, one tick short of where MoveTargetSystem's arrival
    // check (ARRIVAL_TOLERANCE) fires on the following, non-moving tick.
    function ticksToCloseIn(dt: number): number {
      const world = new World<Entity>();
      const queries = createQueries(world);
      const system = createMoveTargetSystem(queries);

      const self = world.add({
        transform: { position: { x: 0, y: 0 }, rotation: 0 },
        velocity: { x: 0, y: 0 },
        moveSpeed: { value: 30 },
        moveTarget: { position: { x: 30, y: 0 } },
      });

      let ticks = 0;
      while (self.moveTarget) {
        system(world, dt);
        self.transform.position.x += self.velocity.x * dt;
        ticks += 1;
      }
      return ticks;
    }

    const dt30 = 1 / 30;
    const dt20 = 1 / 20;
    const ticksAt30Fps = ticksToCloseIn(dt30);
    const ticksAt20Fps = ticksToCloseIn(dt20);

    // Covering the trip takes `distance / speed` seconds of *movement*,
    // independent of dt, plus one further non-moving tick to detect arrival
    // (ARRIVAL_TOLERANCE) — so total elapsed time (ticks * dt) is within one
    // dt of the other pacing's, rather than drifting apart as frame count
    // grows.
    expect(Math.abs(ticksAt30Fps * dt30 - ticksAt20Fps * dt20)).toBeLessThanOrEqual(
      Math.max(dt30, dt20) + 1e-9
    );
  });

  it('leaves velocity untouched for an entity with no move target', () => {
    const world = new World<Entity>();
    const queries = createQueries(world);
    const system = createMoveTargetSystem(queries);

    const self = world.add({
      transform: { position: { x: 0, y: 0 }, rotation: 0 },
      velocity: { x: 3, y: 4 },
      moveSpeed: { value: 10 },
    });

    system(world, 1 / 60);

    expect(self.velocity).toEqual({ x: 3, y: 4 });
  });
});
