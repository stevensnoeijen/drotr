import { Node } from './nodes/node';

export class Tree {
  constructor(public readonly root: Node) {}

  public update(): void {
    this.root.evaluate();
  }
}
