// deno-lint-ignore verbatim-module-syntax
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { type App as AppType, newApp } from "./App.ts";
import type { System, SystemEntity } from "./System.ts";

type AppSet<Entity> = {
  /** Instantiates an ECS app and acts a provider for ecs hooks. */
  App: (
    props: Partial<AppType<Entity>> & {
      newEntity: (
        partialEntity: Partial<Entity>,
        app: AppType<Entity>,
      ) => Entity;
      initApp?: (app: AppType<Entity>) => void;
      children?: React.ReactNode;
    },
  ) => React.JSX.Element;

  /** Installs a system into the current app. */
  useSystem: <K extends keyof Entity>(
    systemDefinition: Partial<System<Entity, K>>,
  ) => void;

  /** A wrapper around useSystem. */
  useEntities: <K extends keyof Entity>(
    systemDefinition: Partial<System<Entity, K>>,
    refreshOnEntityUpdate?: boolean,
  ) => {
    version: number;
    entities: ReadonlySet<SystemEntity<Entity, K>>;
    addedEntities: ReadonlySet<SystemEntity<Entity, K>>;
    removedEntities: ReadonlySet<Entity>;
    modifiedEntities: ReadonlySet<SystemEntity<Entity, K>>;
  };

  /** Returns the current app. */
  useApp: () => AppType<Entity>;

  /** The context used by `App` and `useApp`. */
  AppContext: React.Context<AppType<Entity>>;
};

export const appSet = <Entity extends object>(): AppSet<Entity> => {
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
    const nextEntities = useRef(new Set<SystemEntity<Entity, K>>());
    const addedEntitiesRef = useRef(new Set<SystemEntity<Entity, K>>());
    const removedEntitiesRef = useRef(new Set<Entity>());
    const modifiedEntitiesRef = useRef(new Set<SystemEntity<Entity, K>>());

    const [version, setVersion] = useState(0);
    const [entities, setEntities] = useState<
      ReadonlySet<SystemEntity<Entity, K>>
    >(new Set());
    const [addedEntities, setAddedEntities] = useState<
      ReadonlySet<SystemEntity<Entity, K>>
    >(new Set());
    const [removedEntities, setRemovedEntities] = useState<ReadonlySet<Entity>>(
      new Set(),
    );
    const [modifiedEntities, setModifiedEntities] = useState<
      ReadonlySet<SystemEntity<Entity, K>>
    >(new Set());

    useEffect(() => {
      const trackSystem = app.addSystem({
        ...systemDefinition,
        onAdd: (e) => {
          changed.current = true;
          nextEntities.current.add(e);
          addedEntitiesRef.current.add(e);
          removedEntitiesRef.current.delete(e as Entity);
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
  const App = ({ children, initApp, ...rest }: Partial<AppType<Entity>> & {
    newEntity: (
      partialEntity: Partial<Entity>,
      app: AppType<Entity>,
    ) => Entity;
    initApp?: (app: AppType<Entity>) => void;
    children?: React.ReactNode;
  }) => {
    const [app] = useState(() => newApp(rest));

    useEffect(() => {
      initApp?.(app);
    }, []);

    return <AppContext.Provider value={app}>{children}</AppContext.Provider>;
  };

  return { AppContext, useSystem, App, useEntities, useApp };
};
