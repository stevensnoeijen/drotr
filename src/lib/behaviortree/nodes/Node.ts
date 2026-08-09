export enum State {
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILURE = 'failure',
}

export class Node {
  private _state = State.FAILURE;

  public parent: Node | null = null;

  protected _children: Node[] = [];

  public readonly data: Map<string, unknown> = new Map();

  constructor(children: Node[] = []) {
    this.children = children;
  }

  public get state(): State {
    return this._state;
  }

  protected set state(value: State) {
    this._state = value;
  }

  public get children(): Node[] {
    return this._children;
  }

  public set children(children: Node[]) {
    children.forEach((child) => this.attach(child));
  }

  public attach(child: Node): void {
    this._children.push(child);
    child.parent = this;
  }

  public detach(child: Node): void {
    this._children = this._children.filter((c) => c !== child);
    child.parent = null;
  }

  public evaluate(): State {
    return this.state;
  }

  public getData(key: string): unknown | null {
    if (this.data.has(key)) {
      return this.data.get(key);
    }

    return this.getDataOfParent(key);
  }

  private getDataOfParent(key: string): unknown | null {
    return this.parent?.getData(key) ?? null;
  }

  public setData(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  public hasData(key: string): boolean {
    return this.getData(key) != null;
  }

  public hasChildren(): boolean {
    return this.children.length > 0;
  }

  public get root(): Node {
    return this.parent?.root ?? this;
  }

  protected running(): State.RUNNING {
    return (this.state = State.RUNNING);
  }

  protected success(): State.SUCCESS {
    return (this.state = State.SUCCESS);
  }

  protected failure(): State.FAILURE {
    return (this.state = State.FAILURE);
  }
}
