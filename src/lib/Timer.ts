import { GameTime } from './GameTime';

type OnElapsed = () => void;

type TimerProps = {
  delay: number;
  /**
   * Time already passed.
   * So that the timer is executed earlier as usual or later (negative value).
   */
  elapsedTime?: number;
  onElapsed?: OnElapsed | null;
};

/**
 * Slack allowed when testing the countdown against zero.
 *
 * A countdown is driven down by repeatedly subtracting a delta, and neither
 * the delta nor the delay need be exactly representable in binary floating
 * point: subtracting 1/60 thirty times from 0.5 leaves ~5.6e-17 rather than 0,
 * so a strict `countdown <= 0` reports "not yet" for a timer that has, in
 * every sense that matters, elapsed — pushing it a whole tick late. Half a
 * nanosecond of simulated time is far below any timescale the game models, and
 * comfortably above the rounding error it absorbs.
 */
const ELAPSED_EPSILON = 1e-9;

export class Timer {
  public readonly delay: number;
  public readonly onElapsed: OnElapsed | null;
  private _countdown: number;

  constructor(props: TimerProps) {
    this.delay = props.delay;
    this._countdown = this.delay - (props.elapsedTime ?? 0);
    this.onElapsed = props.onElapsed ?? null;
  }

  public get countdown() {
    return this._countdown;
  }

  /**
   * Time over the countdown.
   * Number is positive.
   */
  public get expiredTime() {
    return this.countdown < 0 ? Math.abs(this.countdown) : 0;
  }

  public isElapsed(): boolean {
    return this.countdown <= ELAPSED_EPSILON;
  }

  public update() {
    this._countdown -= GameTime.delta;

    if (this.isElapsed()) {
      if (this.onElapsed) {
        this.onElapsed();
      }
    }
  }

  /**
   * By resetting {@link Timer#countdown} minus {@link Timer#expiredTime}
   */
  public restart() {
    this._countdown = this.delay - this.expiredTime;
  }

  /**
   * Fully reset timer with full countdown.
   */
  public reset() {
    this._countdown = this.delay;
  }
}
