export class Vector2 {
  public static readonly ZERO: Readonly<Vector2> = Object.seal(
    new Vector2(0, 0)
  );

  public constructor(public x: number, public y: number) {}

  /**
   * Result is never greater than 180 degrees or lower than -180 degrees.
   *
   * @param {Vector2} from
   * @param {Vector2} to
   * @returns {number} angle in degrees between from and to
   */
  public static angle(from: Vector2, to: Vector2): number {
    return Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI);
  }

  public static distance(from: Vector2, to: Vector2): number {
    return Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2));
  }

  public static scale(a: Vector2, b: Vector2): Vector2 {
    return new Vector2(a.x * b.x, a.y * b.y);
  }

  /**
   * @param {Vector2} a
   * @param {Vector2} b
   *
   * @returns {Vector2} made from the smallest components of two vectors
   */
  public static min(a: Vector2, b: Vector2): Vector2 {
    return new Vector2(Math.min(a.x, b.x), Math.min(a.y, b.y));
  }

  /**
   * @param {Vector2} a
   * @param {Vector2} b
   *
   * @returns {Vector2} made from the largest components of two vectors.
   */
  public static max(a: Vector2, b: Vector2): Vector2 {
    return new Vector2(Math.max(a.x, b.x), Math.max(a.y, b.y));
  }

  public static lerp(from: Vector2, to: Vector2, percentage: number): Vector2 {
    return new Vector2(
      from.x * (1 - percentage) + to.x * percentage,
      from.y * (1 - percentage) + to.y * percentage
    );
  }

  public static subtracts(vector: Vector2, subtractor: Vector2): Vector2 {
    return new Vector2(vector.x - subtractor.x, vector.y - subtractor.y);
  }

  public static multiplies(a: Vector2, multiplier: number): Vector2 {
    return new Vector2(a.x * multiplier, a.y * multiplier);
  }

  public static divides(
    a: Vector2,
    devider: number,
    round?: 'floor' | 'ceil'
  ): Vector2 {
    let x = a.x / devider;
    let y = a.y / devider;
    if (round) {
      x = Math[round](x);
      y = Math[round](y);
    }

    return new Vector2(x, y);
  }

  public static adds(a: Vector2, b: Vector2): Vector2 {
    return new Vector2(a.x + b.x, a.y + b.y);
  }

  /**
   * @returns {number} length of the vector
   */
  public magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  public normalized(): Vector2 {
    const magnitude = this.magnitude();

    return new Vector2(
      this.x !== 0 ? this.x / magnitude : 0,
      this.y !== 0 ? this.y / magnitude : 0
    );
  }

  public equals(other: Vector2): boolean {
    return this.x === other.x && this.y === other.y;
  }

  public toString(): string {
    return `${this.x},${this.y}`;
  }
}
