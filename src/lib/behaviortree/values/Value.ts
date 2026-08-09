import { StaticValue } from './StaticValue';
import { RandomNumber } from './RandomNumber';
import type { IValue } from './IValue';

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
