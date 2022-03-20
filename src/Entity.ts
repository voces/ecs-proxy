import { App } from "./App.ts";

export const trackProp = <Entity, Prop extends keyof Entity>(
  app: App<Entity>,
  entity: Entity,
  prop: Prop,
  propertyDescriptor?: PropertyDescriptor,
) => {
  let value: Entity[Prop] | undefined = entity[prop];
  Object.defineProperty(entity, prop, {
    enumerable: true,
    get: () => value,
    set: (newValue) => {
      const changed = newValue !== value;
      value = newValue;
      if (changed) app.onEntityPropChange(entity, prop);
    },
    ...propertyDescriptor,
  });
};
