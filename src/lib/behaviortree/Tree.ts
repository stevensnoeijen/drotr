import { Node } from './nodes/Node';

export class Tree {
  constructor(public readonly root: Node) {}

  public update(): void {
    this.root.evaluate();
  }
}
