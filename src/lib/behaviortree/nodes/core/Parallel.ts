import { Node, State } from '../Node';

/**
 * Processes all of its children at the same time and only "computes" its success/failure state at the end of all child executions
 */
export class Parallel extends Node {
  constructor(children: Node[], public readonly requireAllSuccess = false) {
    super(children);
  }

  public evaluate(): State {
    if (!this.hasChildren()) {
      return this.success();
    }

    let failedChildren = 0;
    let runningChildren = 0;

    for (const child of this.children) {
      switch (child.evaluate()) {
        case State.SUCCESS:
          continue;
        case State.RUNNING:
          runningChildren++;
          continue;
        case State.FAILURE:
        default:
          failedChildren++;
          continue;
      }
    }

    if (
      (this.requireAllSuccess && failedChildren > 0) ||
      failedChildren === this.children.length
    ) {
      return this.failure();
    } else {
      return runningChildren > 0 ? this.running() : this.success();
    }
  }
}
