import { Node, State } from '../Node';

/**
 * This is the "And" operator.
 */
export class Sequence extends Node {
  public evaluate(): State {
    let anyChildIsRunning = false;

    for (const child of this.children) {
      switch (child.evaluate()) {
        case State.RUNNING:
          anyChildIsRunning = true;
          continue;
        case State.SUCCESS:
          continue;
        case State.FAILURE:
        default:
          return this.failure();
      }
    }

    return anyChildIsRunning ? this.running() : this.success();
  }
}
