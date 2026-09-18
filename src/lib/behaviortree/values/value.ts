import { StaticValue } from './static-value';
import { RandomNumber } from './random-number';
import type { IValue } from './i-value';

export class Value {
  static static<Type>(value: Type): IValue<Type> {
    return new StaticValue(value);
  }

  static randomNumber(
    min: number,
    max: number,
    round: boolean
  ): IValue<number> {
    return new RandomNumber(min, max, round);
  }
}
