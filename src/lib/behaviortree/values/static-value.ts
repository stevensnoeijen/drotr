import type { IValue } from './i-value';

export class StaticValue<Type> implements IValue<Type> {
  constructor(private readonly _value: Type) {}

  get value() {
    return this._value;
  }
}
