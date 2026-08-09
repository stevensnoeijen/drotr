import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_FIXED_STEP,
  DEFAULT_MAX_FRAME_TIME,
  GameLoop,
} from './GameLoop';

describe('GameLoop', () => {
  it('runs the expected number of fixed steps for a whole-number frame', () => {
    const update = vi.fn();
    const loop = new GameLoop({ update, fixedStep: 1 / 60 });

    // 250ms with a 1/60s step is exactly 15 steps, and 0.25s does not exceed
    // the default clamp, so nothing is dropped.
    const steps = loop.advance(0.25);

    expect(steps).toBe(15);
    expect(update).toHaveBeenCalledTimes(15);
    expect(update).toHaveBeenCalledWith(1 / 60);
    expect(loop.tick).toBe(15);
    // 0.25 is an exact multiple of 1/60, so no remainder is banked.
    expect(loop.accumulatedTime).toBeCloseTo(0, 10);
  });

  it('banks the sub-step remainder for the next frame', () => {
    const loop = new GameLoop({ update: vi.fn(), fixedStep: 1 / 60 });

    // Half a step: not enough to run, fully banked.
    expect(loop.advance(1 / 120)).toBe(0);
    expect(loop.tick).toBe(0);
    expect(loop.accumulatedTime).toBeCloseTo(1 / 120, 10);

    // Another half step tops the accumulator up to exactly one step.
    expect(loop.advance(1 / 120)).toBe(1);
    expect(loop.tick).toBe(1);
    expect(loop.accumulatedTime).toBeCloseTo(0, 10);
  });

  it('clamps an over-long frame to avoid the spiral of death', () => {
    const update = vi.fn();
    const loop = new GameLoop({
      update,
      fixedStep: 1 / 60,
      maxFrameTime: 0.25,
    });

    // A 10-second stall would be 600 steps unclamped; clamped to 0.25s it is
    // only 15, and no leftover time is carried over.
    const steps = loop.advance(10);

    expect(steps).toBe(15);
    expect(update).toHaveBeenCalledTimes(15);
    expect(loop.accumulatedTime).toBeCloseTo(0, 10);
  });

  it('is deterministic regardless of how wall-clock time is split into frames', () => {
    // Power-of-two timings so the arithmetic is bit-exact in binary floating
    // point: the whole point of the fixed timestep is that the split can never
    // change the result, so the assertions below must hold exactly, not just
    // approximately.
    const fixedStep = 1 / 64;

    const run = (frames: number[]): { ticks: number; sum: number } => {
      let sum = 0;
      const loop = new GameLoop({
        update: (dt) => {
          sum += dt;
        },
        fixedStep,
        maxFrameTime: 1,
      });
      for (const frame of frames) {
        loop.advance(frame);
      }
      return { ticks: loop.tick, sum };
    };

    // One second delivered three different ways, each frame within the clamp:
    // one big frame, 64 even frames, and an irregular power-of-two pattern.
    const oneBigFrame = run([1]);
    const evenFrames = run(Array.from({ length: 64 }, () => fixedStep));
    const jitteryFrames = run([
      0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625, 0.015625,
    ]);

    expect(oneBigFrame.ticks).toBe(64);
    expect(evenFrames.ticks).toBe(64);
    expect(jitteryFrames.ticks).toBe(64);

    // The simulated time is identical too, not just the step count.
    expect(oneBigFrame.sum).toBe(1);
    expect(evenFrames.sum).toBe(1);
    expect(jitteryFrames.sum).toBe(1);
  });

  it('accumulates ticks across successive frames', () => {
    const loop = new GameLoop({ update: vi.fn(), fixedStep: 1 / 60 });

    loop.advance(0.25);
    loop.advance(0.25);

    expect(loop.tick).toBe(30);
  });

  it('reset clears tick count and accumulated time', () => {
    const loop = new GameLoop({ update: vi.fn(), fixedStep: 1 / 60 });

    loop.advance(0.1);
    expect(loop.tick).toBeGreaterThan(0);

    loop.reset();

    expect(loop.tick).toBe(0);
    expect(loop.accumulatedTime).toBe(0);
  });

  it('exposes sensible defaults', () => {
    const loop = new GameLoop({ update: vi.fn() });

    expect(loop.fixedStep).toBe(DEFAULT_FIXED_STEP);
    expect(loop.maxFrameTime).toBe(DEFAULT_MAX_FRAME_TIME);
  });
});
