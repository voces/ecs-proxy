import type { System, SystemEntity } from "./System.ts";

/** An ECS application that manages entities and systems. */
export type App<Entity> = {
  /** Create, add, and return a new entity from the given partial data. */
  addEntity: <T extends Entity>(partial: Partial<T>) => T;

  /** Remove an entity from the app and invoke its systems’ removal hooks. */
  removeEntity: (entity: Entity) => void;

  /** Add a new system. */
  addSystem: <K extends keyof Entity>(
    partial: Partial<System<Entity, K>>,
  ) => System<Entity, K>;

  /** Remove a system and invoke its removal hooks for all entities. */
  removeSystem: <K extends keyof Entity>(system: System<Entity, K>) => void;

  /**
   * Advance the world by one tick, running each system’s update logic.
   * @param delta Time (ms) since last update; if omitted, computed from `lastUpdate`.
   * @param next Current timestamp (ms); if omitted, computed as `lastUpdate + delta`.
   */
  update: (delta?: number, next?: number) => void;

  /** Timestamp (ms) when `update` was last called. */
  lastUpdate: number;

  /** All entities currently added to the app. */
  entities: Set<Entity>;

  /** All systems currently added to the app. */
  systems: Set<System<Entity, never>>;

  /**
   * Schedule a one‑off callback to run after all side‑effects have been
   * applied.
   */
  enqueue: (fn: () => void) => void;

  /**
   * Customize how raw entity data is turned into a full-fledged Entity.
   * Called once per `add()`.
   */
  initializeEntity: (
    partialEntity: Partial<Entity>,
    app: App<Entity>,
  ) => Entity;

  /**
   * Record that `entity[property]` has changed—
   * schedules matching system hooks to run later.
   */
  queueEntityChange: (entity: Entity, property: keyof Entity) => void;

  /**
   * Set up property interception on `entity[prop]` so that assignments defer
   * system side‑effects automatically.
   */
  observeProperty: <K extends keyof Entity>(
    entity: Entity,
    prop: K,
    propertyDescriptor?: PropertyDescriptor,
  ) => void;

  /**
   * Wrap a block of work so that any nested system hooks are deferred
   * until after the block completes.
   */
  batch: <T>(fn: () => T) => T;

  /** Immediately process any pending system side‑effects. */
  flush: () => void;

  /** For each entity property, the list of systems that depend on it. */
  propMap: { [K in keyof Entity]?: System<Entity, K>[] };

  /**
   * Queued property‑change events awaiting dispatch to systems.
   */
  entityChangeQueue: Map<
    Entity,
    Map<System<Entity, never>, Set<keyof Entity>>
  >;

  /**
   * Callbacks to run after each batch of system side‑effects.
   */
  callbackQueue: (() => void)[];

  /**
   * Whether a deferred dispatch is already pending.
   */
  flushScheduled: boolean;
};

/** Applies default ECS app methods to the passed partial app. */
export const newApp = <Entity extends object>(
  partialApp: Partial<App<Entity>> & {
    initializeEntity: (
      partialEntity: Partial<Entity>,
      app: App<Entity>,
    ) => Entity;
  },
): App<Entity> => {
  const app = partialApp as App<Entity>;

  app.addEntity ??= <T extends Entity>(partialEntity: Partial<T>): T =>
    app.batch(() => {
      // Don't add the same entity multiple times
      if (app.entities.has(partialEntity as T)) {
        return partialEntity as T;
      }

      const entity = app.initializeEntity(partialEntity, app) as T;

      app.entities.add(entity);

      // Add entity to existing systems
      const systems = Object.keys(entity).flatMap((prop) =>
        app.propMap[prop as keyof Entity] ?? []
      );

      let changes = app.entityChangeQueue.get(entity);
      if (!changes) {
        changes = new Map();
        app.entityChangeQueue.set(entity, changes);
      }

      for (const system of systems as System<Entity, never>[]) {
        if (system) {
          if (
            system.props?.every((prop) => entity[prop] != null) &&
            !system.entities.has(entity)
          ) {
            const existing = changes.get(system);
            // Add the property to the list of changed properties so we know what to look for
            if (existing) {
              for (const prop of system.props ?? []) existing.add(prop);
            } else changes.set(system, new Set(system.props));
          }
        }
      }

      return entity;
    });

  app.removeEntity ??= (entity) =>
    app.batch(() => {
      app.entities.delete(entity);

      let changes = app.entityChangeQueue.get(entity);
      if (!changes) {
        changes = new Map();
        app.entityChangeQueue.set(entity, changes);
      }

      for (const system of app.systems as Set<System<Entity, never>>) {
        if (system.entities.has(entity)) {
          const existing = changes.get(system);
          if (!existing) changes.set(system, new Set());
        }
      }
    });

  app.addSystem ??= <K extends keyof Entity>(
    partialSystem: Partial<System<Entity, K>>,
  ) =>
    app.batch(() => {
      // Allow direct adding of plain objects
      const system = partialSystem as System<Entity, K>;
      system.entities ??= new Set();

      app.systems.add(system as System<Entity, never>);

      // System has children;
      if (system.props) {
        for (const prop of system.props) {
          if (!app.propMap[prop]) app.propMap[prop] = [];
          app.propMap[prop]!.push(system);
        }

        // Add existing matching children
        for (
          const entity of app.entities as Set<SystemEntity<Entity, never>>
        ) {
          if (system.props!.every((prop) => entity[prop] != null)) {
            let changes = app.entityChangeQueue.get(entity);
            if (!changes) {
              changes = new Map();
              app.entityChangeQueue.set(entity, changes);
            }

            const existing = changes.get(system as System<Entity, never>);
            // Add the property to the list of changed properties so we know what to look for
            if (existing) {
              for (const prop of system.props ?? []) existing.add(prop);
            } else {
              changes.set(
                system as System<Entity, never>,
                new Set(system.props),
              );
            }
          }
        }
      }

      return system as System<Entity, K>;
    });

  app.removeSystem ??= <K extends keyof Entity>(system: System<Entity, K>) =>
    app.batch(() => {
      if (system.props) {
        for (const prop of system.props) {
          const systems = app.propMap[prop];
          if (systems) {
            const index = systems.indexOf(system);
            if (index >= 0) systems.splice(index);
          }
        }
      }

      app.systems.delete(system as System<Entity, never>);

      if (system.onRemove) {
        for (
          const entity of system.entities as Set<SystemEntity<Entity, never>>
        ) {
          let changes = app.entityChangeQueue.get(entity);
          if (!changes) {
            changes = new Map();
            app.entityChangeQueue.set(entity, changes);

            const existing = changes.get(system as System<Entity, never>);
            if (!existing) {
              changes.set(system as System<Entity, never>, new Set());
            }
          }
        }
      }
    });

  app.update ??= (delta?: number, next?: number) =>
    app.batch(() => {
      if (delta === undefined) {
        if (next === undefined) next = Date.now() / 1000;
        delta = next - app.lastUpdate;
      } else if (next === undefined) next = app.lastUpdate + delta;
      app.lastUpdate = next;

      for (const system of app.systems) {
        system.update?.(delta, next);

        if (system.updateEntity) {
          for (const child of system.entities) {
            system.updateEntity(child, delta, next);
          }
        }
      }
    });

  app.lastUpdate ??= Date.now() / 1000;

  app.entities ??= new Set();

  app.systems ??= new Set();

  app.enqueue ??= (fn: () => void) => {
    app.callbackQueue.push(fn);
  };

  app.queueEntityChange ??= (entity, property) =>
    app.batch(() => {
      // Ignore changes on entities not added
      if (!app.entities.has(entity)) return;

      const systems = app.propMap[property] as
        | System<Entity, never>[]
        | undefined;
      if (!systems) return;

      let changes = app.entityChangeQueue.get(entity);
      if (!changes) {
        changes = new Map();
        app.entityChangeQueue.set(entity, changes);
      }

      for (const system of systems) {
        const existing = changes.get(system);
        // Add the property to the list of changed properties so we know what to look for
        if (existing) existing.add(property);
        else changes.set(system, new Set([property]));
      }
    });

  app.observeProperty ??= <Prop extends keyof Entity>(
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
        if (changed) app.queueEntityChange(entity, prop);
      },
      ...propertyDescriptor,
    });
  };

  app.batch ??= (fn) => {
    const willFlush = !app.flushScheduled;
    app.flushScheduled = true;

    try {
      return fn();
    } finally {
      if (willFlush) app.flush();
    }
  };

  app.flush ??= () => {
    while (app.callbackQueue.length || app.entityChangeQueue.size) {
      while (app.entityChangeQueue.size) {
        const [entity, changes] = app.entityChangeQueue.entries().next()
          .value!;

        while (changes.size) {
          const [system, props] = changes.entries().next().value as [
            System<Entity, never>,
            Set<keyof Entity>,
          ];
          changes.delete(system);

          // Already in the system; either a change or removal
          if (system.entities.has(entity)) {
            // If every modified prop is present, it's a change
            if (
              Array.from(props).every((p) => entity[p] != null) &&
              app.entities.has(entity) &&
              app.systems.has(system)
            ) {
              system.onChange?.(entity);

              // Otherwise it's a removal
            } else {
              system.entities.delete(entity);
              system.onRemove?.(entity);
            }
            // Not in the system; may be an add
          } else if (system.props?.every((p) => entity[p] != null)) {
            system.entities.add(entity);
            system.onAdd?.(entity);
          }
        }

        app.entityChangeQueue.delete(entity);
      }

      if (app.callbackQueue.length) app.callbackQueue.shift()!();
    }

    app.flushScheduled = false;
  };

  app.propMap ??= {};

  app.entityChangeQueue ??= new Map<
    Entity,
    Map<System<Entity, never>, Set<keyof Entity>>
  >();

  app.callbackQueue ??= [];

  app.flushScheduled ??= false;

  return app;
};
