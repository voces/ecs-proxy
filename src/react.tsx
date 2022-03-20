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
  const AppContext = createContext<AppType<Entity>>(
    newApp({ newEntity: (e) => e as Entity }),
  );

  const useSystem = <K extends keyof Entity>(
    systemDefinition: System<Entity, K>,
  ) => {
    useEffect(() => {
      const app = useContext(AppContext);
      const system = app.addSystem(systemDefinition);

      return () => app.deleteSystem(system);
    }, systemDefinition.props ?? []);
  };

  const useEntities = <K extends keyof Entity>(
    props: K[],
    refreshOnEntityUpdate = false,
  ) => {
    const app = useContext(AppContext);
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
      const app = useContext(AppContext);
      const system = app.addSystem({
        props,
        onAdd: (e) => {
          if (lastComponentRenderTime !== app.lastUpdate) {
            setAddedEntities(new Set());
            setRemovedEntities(new Set());
            setLastComponentRenderTime(app.lastUpdate);
          }

          if (entities.has(e)) return;

          const newEntities = new Set(entities);
          newEntities.add(e);
          setEntities(newEntities);

          const newAddedEntities = new Set(addedEntities);
          newAddedEntities.add(e);
          setAddedEntities(newAddedEntities);
        },
        onRemove: (e) => {
          if (lastComponentRenderTime !== app.lastUpdate) {
            setAddedEntities(new Set());
            setRemovedEntities(new Set());
            setLastComponentRenderTime(app.lastUpdate);
          }

          // deno-lint-ignore no-explicit-any
          if (!entities.has(e as any)) return;

          const newEntities = new Set(entities);
          // deno-lint-ignore no-explicit-any
          newEntities.delete(e as any);
          setEntities(newEntities);

          const newRemovedEntities = new Set(removedEntities);
          newRemovedEntities.delete(e);
          setRemovedEntities(newRemovedEntities);
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
          }
          : undefined,
      });

      return () => app.deleteSystem(system);
    }, props ?? []);

    return { entities, addedEntities, removedEntities };
  };

  const App: FC<
    Partial<AppType<Entity>> & {
      newEntity: (partialEntity: Partial<Entity>) => Entity;
    }
  > = ({ children, ...rest }) => {
    const [app] = useState(() => newApp(rest));

    if (!app) return null;

    return <AppContext.Provider value={app}>{children}</AppContext.Provider>;
  };

  return { AppContext, useSystem, App, useEntities };
};
