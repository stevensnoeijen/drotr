import { Node, State } from '../Node';

export class Always extends Node {
  constructor(state: State) {
    super([]);

    this.state = state;
  }
}
