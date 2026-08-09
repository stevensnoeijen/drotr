import { Node, State } from '../Node';

const invertStateMap = new Map<State, State>([
  [State.FAILURE, State.SUCCESS],
  [State.SUCCESS, State.FAILURE],
  [State.RUNNING, State.RUNNING],
]);

/**
 * This is the "Not" operator (!).
 */
export class Inverter extends Node {
  constructor (node: Node){
    super([node]);
  }

  public evaluate(): State {
    if (!this.hasChildren()) {
      return this.failure();
    }

    const childState = this.children[0].evaluate();
    if (!invertStateMap.has(childState)) {
      return this.failure();
    }

    return (this.state = invertStateMap.get(childState)!);
  }
}
