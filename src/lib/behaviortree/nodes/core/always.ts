import { Node, State } from '../node';

export class Always extends Node {
  constructor(state: State) {
    super([]);

    this.state = state;
  }
}
