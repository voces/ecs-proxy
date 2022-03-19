import { System } from "./System.ts";

export type App<Entity> = {
  /** Invoke an update. */
  update: (delta?: number, next?: number) => void;

  /** Handler that receives entity changes and notifies systems. */
  onEntityPropChange: (entity: Entity, property: keyof Entity) => void;

  /** Remove the entity from the app and all systems. */
  delete: (entity: Entity) => void;

  /** Add an entity to the App. */
  add: (partial: Partial<Entity>) => Entity;

  /** Add a system to the App. */
  addSystem: <K extends keyof Entity>(
    partial: System<Entity, K>,
  ) => System<Entity, K>;

  /** Remove a system from the App. */
  deleteSystem: <K extends keyof Entity>(system: System<Entity, K>) => void;

  /** Initialize a new entity */
  newEntity: (partialEntity: Partial<Entity>) => Entity;
};

export const newApp = <Entity extends { entityId: string }>(
  partialApp: Partial<App<Entity>> & {
    newEntity: (partialEntity: Partial<Entity>) => Entity;
  },
): App<Entity> => {
  const app = partialApp as App<Entity>;
  const entities: Record<string, Entity> = {};
  const childPropMap: { [K in keyof Entity]?: System<Entity, K>[] } = {};

  const systems = new Set<System<Entity, keyof Entity>>();
  const systemsEntities = new Map<System<Entity, keyof Entity>, Set<Entity>>();

  if (!app.update) {
    let lastUpdate = Date.now() / 1000;
    app.update = (delta?: number, next?: number) => {
      if (delta === undefined) {
        if (next === undefined) next = Date.now() / 1000;
        delta = next - lastUpdate;
      } else if (next === undefined) next = lastUpdate + delta;
      lastUpdate = next;

      for (const system of systems) {
        system.update?.(delta, next);

        const entities = systemsEntities.get(system);
        if (system.updateChild && entities) {
          for (const child of entities) {
            // deno-lint-ignore no-explicit-any
            system.updateChild(child as any, delta, next);
          }
        }
      }
    };
  }

  if (!app.delete) {
    app.delete = (child) => {
      //   if (child.beforeDelete?.(child) === false) return;

      for (const system of systems) {
        const entities = systemsEntities.get(system);
        if (entities?.has(child)) {
          entities.delete(child);
          system.onRemove?.(child);
        }
      }

      delete entities[child.entityId];
    };
  }

  if (!app.onEntityPropChange) {
    app.onEntityPropChange = (entity, property) => {
      // Ignore changes on entities not added
      if (!entities[entity.entityId]) return;

      const systems = childPropMap[property];
      if (systems) {
        for (const system of systems!) {
          const entities = systemsEntities.get(system);

          // Fast path: mutating a single value and other values are good
          if (entities?.has(entity)) {
            // Just a mutation
            if (entity[property] != null) {
              // deno-lint-ignore no-explicit-any
              system.onChange?.(entity as any);

              // We nulled a required prop
            } else {
              entities.delete(entity);
              system.onRemove?.(entity);
            }

            continue;
          }

          // Slow path; we might need to add the entity to the system, so we
          // must check all required props
          const next = system.props?.every((prop) => entity[prop] != null) ??
            false;
          if (next) {
            entities?.add(entity);
            // deno-lint-ignore no-explicit-any
            system.onAdd?.(entity as any);
          }
        }
      }
    };
  }

  if (!app.add) {
    app.add = (partialEntity) => {
      // Allow direct adding of plain objects
      const entity = "isEntity" in partialEntity
        ? partialEntity as Entity
        : app.newEntity(
          Object.assign(partialEntity, {
            entityId: partialEntity.entityId ?? crypto.randomUUID(),
          }),
        );

      // Don't add the same entity multiple times
      if (entities[entity.entityId]) {
        console.warn("Adding already added entity", entity.entityId);
        return entities[entity.entityId];
      }

      entities[entity.entityId] = entity;

      // Add entity to existing systems
      const systems = Object.keys(entity).flatMap((prop) =>
        childPropMap[prop as keyof Entity] ?? []
      );
      for (const system of systems) {
        if (system) {
          const entities = systemsEntities.get(system);
          if (
            entities && system.props?.every((prop) => entity[prop] != null) &&
            !entities.has(entity)
          ) {
            entities.add(entity);
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
      partialSystem: System<Entity, K>,
    ) => {
      // Allow direct adding of plain objects
      const system = partialSystem as System<Entity, keyof Entity>;
      const systemEntities = new Set<Entity>();
      systemsEntities.set(system, systemEntities);

      // System has children;
      if (system.props) {
        for (const prop of system.props) {
          if (!childPropMap[prop]) childPropMap[prop] = [];
          childPropMap[prop]!.push(system);
        }

        // Add existing matching children
        for (const entityId in entities) {
          const entity = entities[entityId];
          if (system.props.every((prop) => entity[prop] != null)) {
            systemEntities.add(entity);
            // deno-lint-ignore no-explicit-any
            system.onAdd?.(entity as any);
          }
        }
      }

      systems.add(system);

      return system as System<Entity, K>;
    };
  }

  if (!app.deleteSystem) {
    app.deleteSystem = (system) => {
      systemsEntities.delete(system);

      if (system.props) {
        for (const prop of system.props) {
          const systems = childPropMap[prop];
          if (systems) {
            const index = systems.indexOf(system);
            if (index >= 0) systems.splice(index);
          }
        }
      }

      systems.delete(system);
    };
  }

  return app;
};
