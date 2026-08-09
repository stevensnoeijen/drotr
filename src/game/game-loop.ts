/** One fixed simulation step, in seconds (60 Hz). */
export const DEFAULT_FIXED_STEP = 1 / 60;

/**
 * Largest wall-clock frame time, in seconds, that will be simulated in one
 * `advance`. Longer frames (an alt-tab, a GC pause, a breakpoint) are clamped
 * to this so the accumulator can never demand more steps than a frame can run —
 * the classic "spiral of death".
 */
export const DEFAULT_MAX_FRAME_TIME = 0.25;

export interface GameLoopOptions {
  /** Called once per fixed step with the constant timestep. */
  update: (dt: number) => void;
  /** Seconds per fixed step. Defaults to {@link DEFAULT_FIXED_STEP}. */
  fixedStep?: number;
  /** Frame-time clamp in seconds. Defaults to {@link DEFAULT_MAX_FRAME_TIME}. */
  maxFrameTime?: number;
}

/**
 * A fixed-timestep loop with a frame-time accumulator. Feed it variable
 * wall-clock frame times via {@link GameLoop.advance}; it calls `update` a whole
 * number of times with a constant `dt`, banking the remainder for next frame.
 *
 * This decouples simulation rate from render rate and makes the simulation
 * deterministic: the same sequence of fixed steps produces the same state
 * regardless of how the wall-clock time was chopped into frames.
 *
 * It imports nothing from Pixi and can run entirely headlessly; the renderer is
 * responsible only for calling `advance` with `ticker.deltaMS / 1000`.
 */
export class GameLoop {
  public readonly fixedStep: number;
  public readonly maxFrameTime: number;

  private readonly update: (dt: number) => void;
  private accumulator = 0;
  private _tick = 0;

  constructor(options: GameLoopOptions) {
    this.update = options.update;
    this.fixedStep = options.fixedStep ?? DEFAULT_FIXED_STEP;
    this.maxFrameTime = options.maxFrameTime ?? DEFAULT_MAX_FRAME_TIME;
  }

  /** Total number of fixed steps run since construction (or last reset). */
  public get tick(): number {
    return this._tick;
  }

  /** Unsimulated time carried over to the next frame, in seconds. */
  public get accumulatedTime(): number {
    return this.accumulator;
  }

  /**
   * Advances the simulation by one rendered frame.
   *
   * @param frameTime Wall-clock time since the previous frame, in seconds.
   * @returns The number of fixed steps executed this call.
   */
  public advance(frameTime: number): number {
    // Clamp before accumulating: a huge frame must not be able to queue up an
    // unbounded number of steps.
    this.accumulator += Math.min(frameTime, this.maxFrameTime);

    let steps = 0;
    while (this.accumulator >= this.fixedStep) {
      this.update(this.fixedStep);
      this.accumulator -= this.fixedStep;
      this._tick += 1;
      steps += 1;
    }
    return steps;
  }

  /** Resets tick count and accumulated time to zero. */
  public reset(): void {
    this.accumulator = 0;
    this._tick = 0;
  }
}
