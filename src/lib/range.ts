export class Range {
  public static readonly ZERO = new Range(0, 0);

  public readonly min: number;

  public readonly max: number;

  constructor(min: number = 0, max: number = 0) {
    this.min = min;
    this.max = max;
  }

  includes(value: number) {
    return value >= this.min && value <= this.max;
  }

  toJSON() {
    return {
      min: this.min,
      max: this.max,
    };
  }

  toString() {
    return `${this.min} - ${this.max}`;
  }
}
