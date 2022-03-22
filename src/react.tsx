import React, {
  createContext,
  FC,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { App as AppType, newApp } from "./App.ts";
import { System } from "./System.ts";

export const appSet = <Entity,>() => {
  /** Context that stores the current `App`. */
  const AppContext = createContext<AppType<Entity>>(null!);

  /** Returns the current `App` from `AppContext`. */
  const useApp = () => {
    return useContext(AppContext);
  };

  /** Creates a system and attaches it to the current app. */
  const useSystem = <K extends keyof Entity>(
    systemDefinition: Partial<System<Entity, K>>,
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
    systemDefinition: Partial<System<Entity, K>>,
    refreshOnEntityUpdate = false,
  ) => {
    const app = useApp();

    const changed = useRef(false);
    const nextEntities = useRef(new Set<Entity & Required<Pick<Entity, K>>>());
    const addedEntitiesRef = useRef(
      new Set<Entity & Required<Pick<Entity, K>>>(),
    );
    const removedEntitiesRef = useRef(
      new Set<Entity & Required<Pick<Entity, K>>>(),
    );
    const modifiedEntitiesRef = useRef(
      new Set<Entity & Required<Pick<Entity, K>>>(),
    );

    const [version, setVersion] = useState(0);
    const [entities, setEntities] = useState<
      ReadonlySet<Entity & Required<Pick<Entity, K>>>
    >(() => new Set<Entity & Required<Pick<Entity, K>>>());
    const [addedEntities, setAddedEntities] = useState<
      ReadonlySet<Entity & Required<Pick<Entity, K>>>
    >(() => new Set<Entity & Required<Pick<Entity, K>>>());
    const [removedEntities, setRemovedEntities] = useState<ReadonlySet<Entity>>(
      new Set<Entity>(),
    );
    const [modifiedEntities, setModifiedEntities] = useState<
      ReadonlySet<Entity>
    >(new Set<Entity>());

    useEffect(() => {
      const trackSystem = app.addSystem({
        ...systemDefinition,
        onAdd: (e) => {
          changed.current = true;
          nextEntities.current.add(e);
          addedEntitiesRef.current.add(e);
          removedEntitiesRef.current.delete(e);
          modifiedEntitiesRef.current.delete(e);
          systemDefinition.onAdd?.(e);
        },
        onRemove: (e) => {
          changed.current = true;
          // deno-lint-ignore no-explicit-any
          nextEntities.current.delete(e as any);
          // deno-lint-ignore no-explicit-any
          addedEntitiesRef.current.delete(e as any);
          // deno-lint-ignore no-explicit-any
          removedEntitiesRef.current.add(e as any);
          // deno-lint-ignore no-explicit-any
          modifiedEntitiesRef.current.delete(e as any);
          systemDefinition.onRemove?.(e);
        },
        onChange: refreshOnEntityUpdate
          ? (e) => {
            if (addedEntitiesRef.current.has(e)) return;
            changed.current = true;
            modifiedEntitiesRef.current.add(e);
            systemDefinition.onChange?.(e);
          }
          : undefined,
      });

      const tickSystem = app.addSystem({
        update: () => {
          if (changed.current === true) {
            changed.current = false;

            setVersion((version) => version + 1);

            const temp = nextEntities.current;
            nextEntities.current = new Set(nextEntities.current);
            setEntities(temp);

            setAddedEntities(addedEntitiesRef.current);
            addedEntitiesRef.current = new Set();

            setRemovedEntities(removedEntitiesRef.current);
            removedEntitiesRef.current = new Set();

            setModifiedEntities(modifiedEntitiesRef.current);
            modifiedEntitiesRef.current = new Set();
          }
        },
      });

      return () => {
        app.deleteSystem(trackSystem);
        app.deleteSystem(tickSystem);
      };
    }, systemDefinition.props ?? []);

    return {
      version,
      entities,
      addedEntities,
      removedEntities,
      modifiedEntities,
    };
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
