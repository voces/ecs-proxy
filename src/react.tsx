import React, {
  createContext,
  FC,
  useContext,
  useEffect,
  useState,
} from "react";
import { App as AppType, newApp } from "./App.ts";
import { System } from "./System.ts";

export const appSet = <Entity,>() => {
  /** Context that stores the current `App`. */
  const AppContext = createContext<AppType<Entity>>(
    newApp({ newEntity: (e) => e as Entity }),
  );

  /** Returns the current `App` from `AppContext`. */
  const useApp = () => {
    return useContext(AppContext);
  };

  /** Creates a system and attaches it to the current app. */
  const useSystem = <K extends keyof Entity>(
    systemDefinition: System<Entity, K>,
  ) => {
    useEffect(() => {
      const app = useApp();
      const system = app.addSystem(systemDefinition);

      return () => app.deleteSystem(system);
    }, systemDefinition.props ?? []);
  };

  /**
   * `System` wrapper that updates when entities are added or removed from
   * the system. Optionally also updates when entities are updated.
   */
  const useEntities = <K extends keyof Entity>(
    systemDefinition: System<Entity, K>,
    refreshOnEntityUpdate = false,
  ) => {
    const app = useApp();
    const [lastComponentRenderTime, setLastComponentRenderTime] = useState(
      app.lastUpdate,
    );
    const [entities, setEntities] = useState(
      new Set<Entity & Required<Pick<Entity, K>>>(),
    );
    const [addedEntities, setAddedEntities] = useState(
      new Set<Entity & Required<Pick<Entity, K>>>(),
    );
    const [removedEntities, setRemovedEntities] = useState(new Set<Entity>());

    useEffect(() => {
      const system = app.addSystem({
        ...systemDefinition,
        onAdd: (e) => {
          if (lastComponentRenderTime !== app.lastUpdate) {
            setAddedEntities(new Set());
            setRemovedEntities(new Set());
            setLastComponentRenderTime(app.lastUpdate);
          }

          if (!entities.has(e)) {
            const newEntities = new Set(entities);
            newEntities.add(e);
            setEntities(newEntities);

            const newAddedEntities = new Set(addedEntities);
            newAddedEntities.add(e);
            setAddedEntities(newAddedEntities);
          }

          systemDefinition.onAdd?.(e);
        },
        onRemove: (e) => {
          if (lastComponentRenderTime !== app.lastUpdate) {
            setAddedEntities(new Set());
            setRemovedEntities(new Set());
            setLastComponentRenderTime(app.lastUpdate);
          }

          // deno-lint-ignore no-explicit-any
          if (entities.has(e as any)) {
            const newEntities = new Set(entities);
            // deno-lint-ignore no-explicit-any
            newEntities.delete(e as any);
            setEntities(newEntities);

            const newRemovedEntities = new Set(removedEntities);
            newRemovedEntities.delete(e);
            setRemovedEntities(newRemovedEntities);
          }

          systemDefinition.onRemove?.(e);
        },
        onChange: refreshOnEntityUpdate
          ? (e) => {
            if (lastComponentRenderTime !== app.lastUpdate) {
              setAddedEntities(new Set());
              setRemovedEntities(new Set());
              setLastComponentRenderTime(app.lastUpdate);
            }

            const newEntities = new Set(entities);
            newEntities.add(e); // ensure entity in set
            setEntities(newEntities);

            systemDefinition.onChange?.(e);
          }
          : undefined,
      });

      return () => app.deleteSystem(system);
    }, systemDefinition.props ?? []);

    return { entities, addedEntities, removedEntities };
  };

  /** Initializes an ECS App and stores it in AppContext. */
  const App: FC<
    Partial<AppType<Entity>> & {
      newEntity: (
        partialEntity: Partial<Entity>,
        app: AppType<Entity>,
      ) => Entity;
      initApp?: (app: AppType<Entity>) => void;
    }
  > = ({ children, initApp, ...rest }) => {
    const [app] = useState(() => newApp(rest));

    useEffect(() => {
      initApp?.(app);
    }, []);

    if (!app) return null;

    return <AppContext.Provider value={app}>{children}</AppContext.Provider>;
  };

  return { AppContext, useSystem, App, useEntities, useApp };
};
