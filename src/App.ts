import { System } from "./System.ts";
import { Mutable } from "./types.ts";

export type App<Entity> = {
  /** Invoke an update. */
  update: (delta?: number, next?: number) => void;

  /** Last time update was called. */
  lastUpdate: number;

  /** Handler that receives entity changes and notifies systems. */
  onEntityPropChange: (entity: Entity, property: keyof Entity) => void;

  /** Remove the entity from the app and all systems. */
  delete: (entity: Entity) => void;

  /** Add an entity to the App. */
  add: (partial: Partial<Entity>) => Entity;

  /** Add a system to the App. */
  addSystem: <K extends keyof Entity>(
    partial: Partial<System<Entity, K>>,
  ) => System<Entity, K>;

  /** Remove a system from the App. */
  deleteSystem: <K extends keyof Entity>(system: System<Entity, K>) => void;

  /** Initialize a new entity. `partialEntity` should modified and returned. */
  newEntity: (partialEntity: Partial<Entity>, app: App<Entity>) => Entity;

  /** Helper to detect entity changes. */
  trackProp: <K extends keyof Entity>(
    entity: Entity,
    prop: K,
    propertyDescriptor?: PropertyDescriptor,
  ) => void;

  /** All entities added to the app. */
  readonly entities: Set<Entity>;

  /** All systems added to the app. */
  readonly systems: Set<System<Entity, keyof Entity>>;

  /** Mapping between entity properties and systems. */
  readonly propMap: { [K in keyof Entity]?: System<Entity, K>[] };
};

// deno-lint-ignore no-explicit-any
const apps = new WeakMap<App<any>>();

export const newApp = <Entity>(
  partialApp: Partial<App<Entity>> & {
    newEntity: (partialEntity: Partial<Entity>, app: App<Entity>) => Entity;
  },
): App<Entity> => {
  const app = partialApp as App<Entity>;

  if (apps.has(app)) return app;

  {
    const mutApp = app as Mutable<App<Entity>>;
    mutApp.entities ??= new Set();
    mutApp.propMap ??= {};
    mutApp.systems = new Set();
  }

  if (!app.update) {
    app.lastUpdate = Date.now() / 1000;
    app.update = (delta?: number, next?: number) => {
      if (delta === undefined) {
        if (next === undefined) next = Date.now() / 1000;
        delta = next - app.lastUpdate;
      } else if (next === undefined) next = app.lastUpdate + delta;
      app.lastUpdate = next;

      for (const system of app.systems) {
        system.update?.(delta, next);

        if (system.updateChild) {
          for (const child of system.entities) {
            system.updateChild(child, delta, next);
          }
        }
      }
    };
  }

  if (!app.delete) {
    app.delete = (child) => {
      for (const system of app.systems) {
        // deno-lint-ignore no-explicit-any
        if (system.entities.has(child as any)) {
          // deno-lint-ignore no-explicit-any
          system.entities.delete(child as any);
          system.onRemove?.(child);
        }
      }

      app.entities.delete(child);
    };
  }

  if (!app.onEntityPropChange) {
    app.onEntityPropChange = (entity, property) => {
      // Ignore changes on entities not added
      if (!app.entities.has(entity)) return;

      const systems = app.propMap[property];
      if (systems) {
        for (const system of systems!) {
          // Fast path: mutating a single value and other values are good
          // deno-lint-ignore no-explicit-any
          if (system.entities.has(entity as any)) {
            // Just a mutation
            if (entity[property] != null) {
              // deno-lint-ignore no-explicit-any
              system.onChange?.(entity as any);

              // We nulled a required prop
            } else {
              // deno-lint-ignore no-explicit-any
              system.entities.delete(entity as any);
              system.onRemove?.(entity);
            }

            continue;
          }

          // Slow path; we might need to add the entity to the system, so we
          // must check all required props
          const next = system.props?.every((prop) => entity[prop] != null) ??
            false;
          if (next) {
            // deno-lint-ignore no-explicit-any
            system.entities.add(entity as any);
            // deno-lint-ignore no-explicit-any
            system.onAdd?.(entity as any);
          }
        }
      }
    };
  }

  if (!app.add) {
    app.add = (partialEntity) => {
      // Don't add the same entity multiple times
      if (app.entities.has(partialEntity as Entity)) {
        return partialEntity as Entity;
      }

      const entity = app.newEntity(partialEntity, app);

      app.entities.add(entity);

      // Add entity to existing systems
      const systems = Object.keys(entity).flatMap((prop) =>
        app.propMap[prop as keyof Entity] ?? []
      );
      for (const system of systems) {
        if (system) {
          if (
            system.props?.every((prop) => entity[prop] != null) &&
            // deno-lint-ignore no-explicit-any
            !system.entities.has(entity as any)
          ) {
            // deno-lint-ignore no-explicit-any
            system.entities.add(entity as any);
            // deno-lint-ignore no-explicit-any
            system.onAdd?.(entity as any);
          }
        }
      }

      return entity;
    };
  }

  if (!app.addSystem) {
    app.addSystem = <K extends keyof Entity>(
      partialSystem: Partial<System<Entity, K>>,
    ) => {
      // Allow direct adding of plain objects
      const system = partialSystem as System<Entity, keyof Entity>;
      system.entities ??= new Set();

      // System has children;
      if (system.props) {
        for (const prop of system.props) {
          if (!app.propMap[prop]) app.propMap[prop] = [];
          app.propMap[prop]!.push(system);
        }

        // Add existing matching children
        for (const entity of app.entities) {
          if (system.props.every((prop) => entity[prop] != null)) {
            // deno-lint-ignore no-explicit-any
            system.entities.add(entity as any);
            // deno-lint-ignore no-explicit-any
            system.onAdd?.(entity as any);
          }
        }
      }

      app.systems.add(system);

      return system as System<Entity, K>;
    };
  }

  if (!app.deleteSystem) {
    app.deleteSystem = <K extends keyof Entity>(system: System<Entity, K>) => {
      if (system.props) {
        for (const prop of system.props) {
          const systems = app.propMap[prop];
          if (systems) {
            const index = systems.indexOf(system);
            if (index >= 0) systems.splice(index);
          }
        }
      }

      // deno-lint-ignore no-explicit-any
      app.systems.delete(system as any);
    };
  }

  if (!app.trackProp) {
    app.trackProp = <Prop extends keyof Entity>(
      entity: Entity,
      prop: Prop,
      propertyDescriptor?: PropertyDescriptor,
    ) => {
      let value: Entity[Prop] = entity[prop];
      Object.defineProperty(entity, prop, {
        enumerable: true,
        configurable: true,
        get: () => value,
        set: (newValue) => {
          const changed = newValue !== value;
          value = newValue;
          if (changed) app.onEntityPropChange(entity, prop);
        },
        ...propertyDescriptor,
      });
    };
  }

  return app;
};
