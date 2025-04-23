/** An Entity with certain properties present. */
export type SystemEntity<T, K extends keyof T> =
  & {
    [P in K]-?: NonNullable<T[P]>;
  }
  & Omit<T, K>;

/**
 * A system receives entities based on the presence of properties and operaties
 * on them.
 */
export type System<Entity, Props extends keyof Entity> = {
  /** Which Entity properties this system cares about. */
  props?: readonly Props[];

  /** All entities that currently match `props`. */
  entities: Set<SystemEntity<Entity, Props>>;

  /** Called once when an entity first matches `props`. */
  onAdd?: (entity: SystemEntity<Entity, Props>) => void;

  /** Called once when an entity stops matching `props`. */
  onRemove?: (entity: Entity) => void;

  /**
   * Called whenever one of the watched properties changes
   * on an entity that’s already in the system.
   */
  onChange?: (entity: SystemEntity<Entity, Props>) => void;

  /** Called once per frame, before `updateEntity`. */
  update?: (delta: number, time: number) => void;

  /** Called once per frame for each entity in `entities`. */
  updateEntity?: (
    child: SystemEntity<Entity, Props>,
    delta: number,
    time: number,
  ) => void;
};
