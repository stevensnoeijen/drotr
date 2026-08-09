import { Node, State } from '../Node';

/**
 * Select randomly an item in the selector and run it.
 */
export class RandomSelector extends Node {
  public evaluate(): State {
    if (!this.hasChildren()) {
      return this.success();
    }

    const index = Math.round(Math.random() * (this.children.length - 1));

    const state = this.children[index].evaluate();

    if (state === State.SUCCESS) {
      return this.success();
    } else if (state === State.RUNNING) {
      this.state = State.RUNNING;
    }

    if (this.state === State.FAILURE) {
      return this.failure();
    } else if (this.children.length === 0) {
      return this.success();
    }
    return this.state;
  }
}
