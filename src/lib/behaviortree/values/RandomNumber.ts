import type { IValue } from './IValue';

export class RandomNumber implements IValue<number> {
  constructor(
    private readonly min: number,
    private readonly max: number,
    private readonly round: boolean
  ) {}

  get value() {
    const value = this.min + Math.random() * this.max;

    if (this.round) return Math.round(value);

    return value;
  }
}
