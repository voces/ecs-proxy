# Overview

A minimal, unopinionated ECS façade for TS/JS. Does not use arrays of components
and instead uses plain object with properties with systems that operate on
presence of properties.

# Example with `Proxy`

If you want to simply track every single property, you can use the built-in
Proxy to trap all sets and deletes:

```ts
type Entity = {
  id: string;
  position?: { x: number; y: number };
  readonly sprite?: string;
  target?: { x: number; y: number };
  readonly movementSpeed?: number;
};

const app = newApp<Entity>({
  initializeEntity: (input) => {
    const entity: Entity = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
    };
    // Track all properties on the entity
    const proxy = new Proxy(entity as Entity, {
      set: (target, prop, value) => {
        if ((target as any)[prop] === value) return true;
        (target as any)[prop] = value;
        app.queueEntityChange(proxy, prop as any);
        return true;
      },
      deleteProperty: (target, prop) => {
        delete (target as any)[prop];
        app.queueEntityChange(proxy, prop as any);
        return true;
      },
    });
    return proxy;
  },
});
```

# Example with `observeProperty`

If you don't want to listen to every property, or don't want to have to deal
with proxies, you can instead track properties individually. `observeProperty`
is a helper that can set traps for individual properties and automatically
dispatch changes to the app:

```ts
import { newApp } from "jsr:@voces/ecs";

// Define the entity shape
type Entity = {
  id: string;
  position?: { x: number; y: number };
  readonly sprite?: string;
  target?: { x: number; y: number };
  readonly movementSpeed?: number;
};

// Create an app
const app = newApp<Entity>({
  // initializeEntity must be defined
  initializeEntity: (input) => {
    // All required properties on Entity must be set
    const entity: Entity = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
    };
    // Track changes to `position` and `target` on the entity
    app.observeProperty(entity, "position");
    app.observeProperty(entity, "target");
    return entity;
  },
});

// Add a system that reflects the logical entity into a DOM node
const map = new Map<Entity, HTMLDivElement>();
app.addSystem({
  // Properties that must be set on the entity to be added to this system
  props: ["position", "sprite"],
  // Called when the entity is added to the system
  onAdd: (entity) => {
    const div = document.createElement("div");
    div.id = entity.id;
    div.classList.add("entity");
    div.textContent = entity.sprite;
    div.style.left = `${entity.position.x}px`;
    div.style.top = `${entity.position.y}px`;
    document.body.appendChild(div);
    map.set(entity, div);
  },
  // Called when the a tracked property changes on the entity
  onChange: (entity) => {
    const div = map.get(entity);
    if (!div) return;
    div.style.left = `${entity.position.x}px`;
    div.style.top = `${entity.position.y}px`;
  },
  // Called when a required tracked property is unset
  onRemove: (entity) => {
    const div = map.get(entity);
    if (!div) return;
    div.remove();
    map.delete(entity);
  },
});

// Add a system that tweens the entity's position towards a target
app.addSystem({
  props: ["target"],
  // Called for each child in the entity when calling `app.update`.
  updateEntity: (entity, delta) => {
    if (!entity.position) {
      entity.position = entity.target;
      return delete (entity as Entity).target;
    }
    if (!entity.movementSpeed) return (entity as Entity).target = undefined;

    const movement = entity.movementSpeed * delta;
    const distance = ((entity.target.x - entity.position.x) ** 2 +
      (entity.target.y - entity.position.y) ** 2) ** 0.5;
    const percent = movement / distance;

    if (percent >= 1) return app.removeEntity(entity);

    entity.position = {
      x: entity.position.x * (1 - percent) + entity.target.x * percent,
      y: entity.position.y * (1 - percent) + entity.target.y * percent,
    };
  },
});

const animals = [
  { sprite: "🐎", speed: 75 },
  { sprite: "🐐", speed: 60 },
  { sprite: "🐄", speed: 55 },
  { sprite: "🐖", speed: 50 },
  { sprite: "🐑", speed: 45 },
  { sprite: "🐓", speed: 40 },
  { sprite: "🪿", speed: 35 },
  { sprite: "🐤", speed: 30 },
];
// Spawn animals on the right side of the screen that move leftward
setInterval(() => {
  const y = Math.random() * (globalThis.innerHeight - 32);
  const animal = animals[Math.floor(Math.random() * animals.length)];
  app.addEntity({
    position: { x: globalThis.innerWidth, y },
    target: { x: -32, y: y * (0.95 + Math.random() / 10) },
    movementSpeed: animal.speed * (1 + Math.random()),
    sprite: animal.sprite,
  });
}, 100);

// Animation loop
const animate = () => {
  app.update();
  requestAnimationFrame(animate);
};
animate();
```

# Atomic dispatch

Atomic dispatch defers callbacks to other systems until the current system
callback finishes, so entities never get invalidated mid‑processing.

**Why it matters**

- Imagine System A's `updateChild` is looping over an entity.
- It changes a property (`foo`) that System B watches.
- Normally B's `onChange` would fire right away, and if B then clears a property
  `bar` that A still needs, A's loop would resume on a broken entity.

With atomic dispatch, B's `onChange` is **deferred** until after A's
`updateChild` completes. By then, A is done and the world is in a consistent
state.

**enqueue**

Sometimes you may want to depend on the side-effects of other systems. Since
other system callbacks are deferred, you need to explicitly wait for
side-effects to take effect. You can do this using `app.enqueue(fn)`.
