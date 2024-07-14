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
  /**
   * Properties of entities the system is interested in. Required for systems
   * to have entities.
   */
  props?: readonly Props[];

  /** Invoked when an entity is added to the system. */
  onAdd?: (entity: SystemEntity<Entity, Props>) => void;

  /** Invoked when an entity is removed from the system. */
  onRemove?: (entity: Entity) => void;

  /**
   * Invoked each time one of the system-tracked properties of an entity is
   * modified.
   */
  onChange?: (entity: SystemEntity<Entity, Props>) => void;

  /** Invoked each update. */
  update?: (delta: number, time: number) => void;

  /** Invoked each update for each child of the system. */
  updateChild?: (
    child: SystemEntity<Entity, Props>,
    delta: number,
    time: number,
  ) => void;

  entities: Set<SystemEntity<Entity, Props>>;
};
