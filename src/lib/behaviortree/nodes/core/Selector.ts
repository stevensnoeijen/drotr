import { Node, State } from '../Node';

/**
 * This is the "Or" operator.
 */
export class Selector extends Node {
  public evaluate(): State {
    if (!this.hasChildren()) {
      return this.success();
    }

    for (const child of this.children) {
      const state = child.evaluate();

      if (state === State.SUCCESS) {
        return this.success();
      } else if (state === State.RUNNING) {
        this.state = State.RUNNING;
      }
    }

    if (this.state === State.FAILURE) {
      return this.failure();
    } else if (this.children.length === 0) {
      return this.success();
    }
    return this.state;
  }
}
