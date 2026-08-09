import { Timer } from './Timer';

type OnAction = () => void;

export class Cooldown {
  private timer: Timer;

  constructor(time: number, private readonly onAction: OnAction) {
    this.timer = new Timer({
      delay: time,
    });
  }

  update() {
    this.timer.update();
    if (this.timer.isElapsed()) {
      this.onAction();
      this.timer.restart();
    }
  }

  reset() {
    this.timer.reset();
  }
}
