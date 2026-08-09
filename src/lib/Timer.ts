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
    return this.countdown <= 0;
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
