import _ from 'lodash';

/**
 * @param {Record<string, unknown>} props to check
 * @returns true when any property is set (not undefined), else false
 */
export const isAnyPropertySet = (props: Record<string, unknown>) => {
  for (const prop in props) {
    if (props[prop] !== undefined) return true;
  }

  return false;
};

export const omitUndefined = (props: Record<string, unknown>) =>
  _.omitBy(props, _.isUndefined);
