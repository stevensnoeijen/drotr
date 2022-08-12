import { FormInst } from 'naive-ui';

export type PropertyValue = string | boolean | number;

export type Property = {
  field: string;
  value: PropertyValue;
};

export type Component = {
  type: string;
  properties: Property[];
};

export type Entity = {
  name: string;
  components: Component[];
};

export type EntityCreateInstance = {
  form: FormInst;
  entity: Entity;
};
