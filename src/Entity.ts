import type { App } from "./App.ts";

/** Alert `app` and its systems when `prop` changes on `entity`. */
export const trackProp = <Entity, Prop extends keyof Entity>(
  app: App<Entity>,
  entity: Entity,
  prop: Prop,
  propertyDescriptor?: PropertyDescriptor,
): void => {
  let value: Entity[Prop] | undefined = entity[prop];
  Object.defineProperty(entity, prop, {
    enumerable: true,
    get: () => value,
    set: (newValue) => {
      const changed = newValue !== value;
      value = newValue;
      if (changed) app.queueEntityChange(entity, prop);
    },
    ...propertyDescriptor,
  });
};
