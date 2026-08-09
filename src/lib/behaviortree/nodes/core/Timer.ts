import type { IValue } from '../../values/IValue';
import { Node, State } from '../Node';

import { Timer as DeltaTimer } from '~/lib/Timer';

type OnElapsed = () => void;

type TimerProps = {
  delay: IValue<number>;
  /**
   * Time already passed.
   * So that the timer is executed earlier as usual or later (negative value).
   */
  elapsedTime?: IValue<number>;
  onElapsed?: OnElapsed | null;
  execute: Node;
};

export class Timer extends Node {
  private _deltaTimer: DeltaTimer;
  private delay: IValue<number>;
  private onElapsed: OnElapsed | null;

  constructor(props: TimerProps) {
    super([props.execute]);
    this.delay = props.delay;
    this.onElapsed = props.onElapsed ?? null;

    this._deltaTimer = new DeltaTimer({
      delay: props.delay.value,
      elapsedTime: props.elapsedTime?.value,
      onElapsed: props.onElapsed ?? null,
    });
  }

  public get deltaTimer() {
    return this._deltaTimer;
  }

  public evaluate(): State {
    this.deltaTimer.update();

    if (!this.hasChildren()) {
      return this.failure();
    }

    if (this.deltaTimer.isElapsed()) {
      this.state = this.children[0].evaluate();
      this.reset();

      return this.state;
    } else {
      return this.running();
    }
  }

  private reset(): void {
    this._deltaTimer = new DeltaTimer({
      delay: this.delay.value,
      elapsedTime: this.deltaTimer.expiredTime,
      onElapsed: this.onElapsed,
    });
  }
}
