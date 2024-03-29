import { Class } from 'utility-types';

import { PropertyValue } from '~/game/data/types';
import { EntityDefinition } from '~/game/data/EntityDefinition';
import {
  EditablePropertyOptions,
  getEditableProperties,
} from '~/game/data/decorator';
import { Unit } from '~/game/data/Unit';
import { Range } from '~/game/utils/Range';

export const getDefaultValueByType = <T extends unknown>(type: T): T => {
  if (type === String) return '' as T;
  if (type === Number) return 0 as T;
  if (type === Boolean) return false as T;
  if (type === Range) return new Range(0, 0) as T;

  throw new Error(`Can not create default value of unknown type ${type}`);
};

const getDefaultValue = <T extends Class<PropertyValue>>(
  options: EditablePropertyOptions<T>
): T => {
  if (options.defaultValue != null) return options.defaultValue;

  return Array.isArray(options.type)
    ? ([] as unknown as T)
    : getDefaultValueByType(options.type);
};

export const createEmptyEntityDefinition = (): EntityDefinition => {
  const editableProperties = getEditableProperties(Unit)!;

  return {
    name: '',
    properties: Object.keys(editableProperties).reduce((prev, key) => {
      const options = editableProperties[key];

      return {
        ...prev,
        [key]: getDefaultValue(options),
      };
    }, {}) as Unit,
  };
};
