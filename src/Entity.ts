import { currentApp } from "./appContext.ts";

export const trackProp = <Entity, Prop extends keyof Entity>(
  entity: Entity,
  prop: Prop,
  propertyDescriptor?: PropertyDescriptor,
) => {
  let value: Entity[Prop] | undefined = entity[prop];
  const app = currentApp<Entity>();
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
